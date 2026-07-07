/**
 * Job poller. Claims the oldest PENDING job with a guarded update (so multiple
 * workers can't grab the same job) and runs it. Keep infra minimal per spec
 * §6 — a jobs table + poll loop is enough at MVP volume.
 */
import { prisma, type PrismaClient } from '@chess-coach/db';
import { runJob, type RunDeps } from './runner.js';

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

  const user = await db.user.findUniqueOrThrow({ where: { id: job.userId } });
  try {
    await runJob(
      {
        id: job.id,
        userId: job.userId,
        source: job.source,
        params: job.params as { maxGames?: number; perfTypes?: string[] } | null,
      },
      {
        id: user.id,
        email: user.email,
        emailHash: user.emailHash,
        lichessUser: user.lichessUser,
      },
      deps,
    );
  } catch (err) {
    // runJob already recorded FAILED; swallow so the loop continues.
    console.error(`[poller] job ${job.id} failed:`, err instanceof Error ? err.message : err);
  }
  return true;
}

export interface PollLoopOptions {
  intervalMs: number;
  signal?: AbortSignal;
}

/** Run the poll loop until aborted. Drains all ready jobs each tick. */
export async function runPollLoop(deps: RunDeps, opts: PollLoopOptions): Promise<void> {
  while (!opts.signal?.aborted) {
    try {
      // Drain: keep processing while jobs are available.
      while (await processNextJob(deps)) {
        if (opts.signal?.aborted) return;
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
