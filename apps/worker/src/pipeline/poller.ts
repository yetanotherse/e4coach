/**
 * Job poller. Claims the oldest PENDING job with a guarded update (so multiple
 * workers can't grab the same job) and runs it. Keep infra minimal per spec
 * §6 — a jobs table + poll loop is enough at MVP volume.
 */
import { prisma, type JobStatus, type PrismaClient } from '@chess-coach/db';
import { runJob, runPlanJob, type RunDeps } from './runner.js';
import { sendWeeklyNudges, type NudgeDeps, type NudgeOptions } from './nudge.js';

/** Non-terminal statuses a running job passes through (see runner setStage). */
const IN_PROGRESS: JobStatus[] = ['FETCHING', 'EVALUATING', 'CLASSIFYING', 'GENERATING'];

/**
 * Recover jobs that were claimed but stranded in an in-progress state — e.g. the
 * worker was killed mid-run (deploy/restart), so no DONE/FAILED was ever written.
 * The runner heartbeats (bumps updatedAt) as it progresses, so a healthy job's
 * updatedAt stays fresh; anything older than the lease is dead. Requeue it to
 * PENDING, or FAIL it once it has burned through maxAttempts. Guarded WHERE
 * clauses keep this safe with multiple workers and against a job that just
 * resumed progress. Returns how many jobs were acted on.
 */
export async function recoverStaleJobs(
  deps: RunDeps,
  staleJobMs: number,
  maxAttempts: number,
): Promise<number> {
  const db: PrismaClient = deps.db ?? prisma;
  const cutoff = new Date(Date.now() - staleJobMs);
  const stale = await db.analysisJob.findMany({
    where: { status: { in: IN_PROGRESS }, updatedAt: { lt: cutoff } },
  });

  let recovered = 0;
  for (const job of stale) {
    if (job.attempts >= maxAttempts) {
      const res = await db.analysisJob.updateMany({
        where: { id: job.id, status: { in: IN_PROGRESS }, updatedAt: { lt: cutoff } },
        data: {
          status: 'FAILED',
          error: `abandoned after ${job.attempts} attempts (worker restarts?)`,
        },
      });
      if (res.count > 0) {
        recovered++;
        console.warn(`[poller] job ${job.id} abandoned after ${job.attempts} attempts → FAILED`);
      }
    } else {
      const res = await db.analysisJob.updateMany({
        where: { id: job.id, status: { in: IN_PROGRESS }, updatedAt: { lt: cutoff } },
        data: { status: 'PENDING', stage: null },
      });
      if (res.count > 0) {
        recovered++;
        console.warn(
          `[poller] requeued stale job ${job.id} (was ${job.status}, no progress for ${Math.round(staleJobMs / 60000)}m, attempt ${job.attempts})`,
        );
      }
    }
  }
  return recovered;
}

/** Claim and process at most one pending job. Returns true if one was run. */
export async function processNextJob(deps: RunDeps): Promise<boolean> {
  const db: PrismaClient = deps.db ?? prisma;
  const job = await db.analysisJob.findFirst({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
  });
  if (!job) return false;

  // Guarded claim: only succeeds if still PENDING.
  const claim = await db.analysisJob.updateMany({
    where: { id: job.id, status: 'PENDING' },
    data: { status: 'FETCHING', attempts: { increment: 1 } },
  });
  if (claim.count === 0) return false; // lost the race to another worker

  console.log(`[poller] claimed job ${job.id} (source=${job.source}, kind=${job.kind})`);
  const user = await db.user.findUniqueOrThrow({ where: { id: job.userId } });
  const record = {
    id: user.id,
    email: user.email,
    emailHash: user.emailHash,
    lichessUser: user.lichessUser,
    chessComUser: user.chessComUser,
  };
  try {
    if (job.kind === 'plan') {
      // Lightweight re-run of Stage 7 only (dashboard retry CTA): rebuild the
      // week's plan from the latest report — no game analysis.
      await runPlanJob(
        { id: job.id, userId: job.userId, source: job.source, kind: 'plan' },
        record,
        deps,
      );
    } else {
      await runJob(
        {
          id: job.id,
          userId: job.userId,
          source: job.source,
          params: job.params as { maxGames?: number; perfTypes?: string[] } | null,
        },
        record,
        deps,
      );
    }
  } catch (err) {
    // runJob already recorded FAILED; swallow so the loop continues.
    console.error(`[poller] job ${job.id} failed:`, err instanceof Error ? err.message : err);
  }
  return true;
}

export interface PollLoopOptions {
  intervalMs: number;
  signal?: AbortSignal;
  /** requeue in-progress jobs idle longer than this (ms); see recoverStaleJobs */
  staleJobMs: number;
  /** mark FAILED after this many claim attempts */
  maxAttempts: number;
  /** weekly nudge scan (plans/phase-2.md 2.4); omitted = disabled */
  nudge?: {
    deps: NudgeDeps;
    opts: NudgeOptions;
    /** minimum gap between scans (ms) */
    scanIntervalMs: number;
  };
}

/** Run the poll loop until aborted. Drains all ready jobs each tick. */
export async function runPollLoop(deps: RunDeps, opts: PollLoopOptions): Promise<void> {
  let lastNudgeScanAt = 0; // 0 → the first tick scans (fresh worker catches up)
  while (!opts.signal?.aborted) {
    try {
      // Rescue anything stranded by a killed worker before draining the queue.
      await recoverStaleJobs(deps, opts.staleJobMs, opts.maxAttempts);
      // Drain: keep processing while jobs are available.
      while (await processNextJob(deps)) {
        if (opts.signal?.aborted) return;
      }
      // Nudge scan rides the poll loop, rate-limited to once per interval.
      if (opts.nudge && Date.now() - lastNudgeScanAt >= opts.nudge.scanIntervalMs) {
        lastNudgeScanAt = Date.now();
        try {
          await sendWeeklyNudges(opts.nudge.deps, opts.nudge.opts);
        } catch (err) {
          // A failed scan must never disturb job processing.
          console.error('[poller] nudge scan failed:', err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      console.error('[poller] tick error:', err instanceof Error ? err.message : err);
    }
    await sleep(opts.intervalMs, opts.signal);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    });
  });
}
