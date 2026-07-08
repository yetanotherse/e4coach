/**
 * Job runner (spec §4C, §9.1). Threads one AnalysisJob through the staged
 * pipeline: fetch → parse → evaluate → classify → aggregate → generate →
 * persist. Each stage updates AnalysisJob.status/stage for the progress UI.
 * Per-game failures are isolated (skipped + counted) so one bad game never
 * kills the batch (spec §11.4).
 */
import {
  aggregateProfile,
  parseGame,
  scoreUserMoves,
  type AnalysisScope,
  type Analytics,
  type ChessEngine,
  type GameContext,
  type GameSource,
  type ImportedGame,
  type LlmProvider,
  type Mailer,
  type WeaknessProfile,
} from '@chess-coach/core';
import { prisma, Prisma, type PrismaClient } from '@chess-coach/db';
import { evaluateGame } from './evaluate.js';
import { generateReport } from './generate.js';
import { generateSlug } from './slug.js';
import { sendReportReadyEmail } from './notify.js';

export interface RunDeps {
  db?: PrismaClient;
  gameSource: GameSource;
  engine: ChessEngine;
  llm: LlmProvider;
  analytics: Analytics;
  mailer: Mailer;
  appUrl: string;
  /** hard ceiling on games per job (bounds cost, spec §17) */
  maxGames: number;
  maxExamples: number;
  movetimeMs: number;
}

/** Per-job selection controls chosen by the user (spec feedback #6). */
export interface JobParams {
  maxGames?: number;
  perfTypes?: string[];
}

export interface JobRecord {
  id: string;
  userId: string;
  source: string;
  params?: JobParams | null;
}

const DEFAULT_PERF_TYPES = ['blitz', 'rapid', 'classical'];

export interface UserRecord {
  id: string;
  email: string;
  emailHash: string | null;
  lichessUser: string | null;
}

/** Run a single job end-to-end. Returns the created report's public slug. */
export async function runJob(job: JobRecord, user: UserRecord, deps: RunDeps): Promise<string> {
  const db = deps.db ?? prisma;
  const distinctId = user.emailHash ?? user.id;
  const engineMeta: WeaknessProfile['engineMeta'] = {
    kind: deps.engine.name,
    movetimeMs: deps.movetimeMs,
  };

  try {
    if (!user.lichessUser) throw new Error('user has no lichess username');

    // ── Stage 1: fetch ──────────────────────────────────────────────
    // Honor the user's chosen count/time-controls, hard-capped to bound cost.
    const requestedMax = Math.min(job.params?.maxGames ?? deps.maxGames, deps.maxGames);
    const perfTypes = job.params?.perfTypes?.length ? job.params.perfTypes : DEFAULT_PERF_TYPES;
    await setStage(db, job.id, 'FETCHING', 'fetching games');
    const games = await deps.gameSource.fetchRecentGames(user.lichessUser, {
      max: requestedMax,
      rated: true,
      perfTypes,
    });
    await db.analysisJob.update({ where: { id: job.id }, data: { gameCount: games.length } });

    // ── Stages 2-4: parse → evaluate → classify (per game, isolated) ─
    await setStage(db, job.id, 'EVALUATING', 'evaluating positions');
    const { contexts, movesScored, evalCount, skipped } = await analyzeGames(games, deps);

    await setStage(db, job.id, 'CLASSIFYING', 'classifying weaknesses');
    const scope = buildScope(games, contexts.length, skipped, requestedMax, perfTypes);
    const profile = aggregateProfile({
      username: user.lichessUser,
      source: job.source,
      contexts,
      movesScored,
      engineMeta,
      maxExamples: deps.maxExamples,
      scope,
    });

    // ── Stage 5: generate report ────────────────────────────────────
    await setStage(db, job.id, 'GENERATING', 'writing your report');
    const content = await generateReport(profile, deps.llm);

    // ── Stage 6: persist ────────────────────────────────────────────
    const slug = generateSlug();
    await db.report.create({
      data: {
        userId: user.id,
        jobId: job.id,
        publicSlug: slug,
        profile: profile as unknown as Prisma.InputJsonValue,
        content: content as unknown as Prisma.InputJsonValue,
        degraded: content.degraded,
      },
    });
    await db.analysisJob.update({
      where: { id: job.id },
      data: { status: 'DONE', stage: 'done', engineMeta: { ...engineMeta, evalCount, skipped } },
    });

    await deps.analytics.capture(distinctId, 'job_completed', {
      jobId: job.id,
      games: games.length,
      movesScored,
      skipped,
    });

    // Notify the user their report is ready. Email failure must not fail the job.
    try {
      await sendReportReadyEmail(
        deps.mailer,
        user.email,
        `${deps.appUrl}/report/${slug}`,
        user.lichessUser,
      );
    } catch (err) {
      console.warn('[runner] report-ready email failed:', err instanceof Error ? err.message : err);
    }
    return slug;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.analysisJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', error: message },
    });
    await deps.analytics.capture(distinctId, 'job_failed', { jobId: job.id, error: message });
    throw err;
  }
}

interface AnalyzeResult {
  contexts: GameContext[];
  movesScored: number;
  evalCount: number;
  skipped: number;
}

/** Parse + evaluate + score each game, isolating per-game failures. */
async function analyzeGames(games: ImportedGame[], deps: RunDeps): Promise<AnalyzeResult> {
  const contexts: GameContext[] = [];
  let movesScored = 0;
  let evalCount = 0;
  let skipped = 0;

  for (const game of games) {
    try {
      const parsed = parseGame(game);
      const { lookup, evalCount: n } = await evaluateGame(game, parsed, deps.engine, {
        movetimeMs: deps.movetimeMs,
      });
      evalCount += n;
      const moves = scoreUserMoves(parsed, lookup);
      movesScored += moves.length;
      contexts.push({ game, moves, plies: parsed.plies });
    } catch (err) {
      // One bad game must not fail the whole job (spec §11.4).
      skipped++;
      console.warn(`[runner] skipped game ${game.id}:`, err instanceof Error ? err.message : err);
    }
  }

  return { contexts, movesScored, evalCount, skipped };
}

/** Summarize what was actually analyzed, for user-facing transparency (#6). */
function buildScope(
  games: ImportedGame[],
  gamesAnalyzed: number,
  skipped: number,
  requestedMax: number,
  perfTypes: string[],
): AnalysisScope {
  const dates = games.map((g) => g.playedAt).filter(Boolean).sort();
  const timeControls = [...new Set(games.map((g) => g.timeControl).filter(Boolean))];
  const gameTypes = [...new Set(games.map((g) => g.speed).filter((s): s is string => Boolean(s)))];
  return {
    requestedMax,
    gamesFetched: games.length,
    gamesAnalyzed,
    gameTypes,
    skipped,
    perfTypes,
    timeControls,
    ...(dates.length ? { dateFrom: dates[0], dateTo: dates[dates.length - 1] } : {}),
  };
}

type Stage =
  | 'FETCHING'
  | 'EVALUATING'
  | 'CLASSIFYING'
  | 'GENERATING';

async function setStage(
  db: PrismaClient,
  jobId: string,
  status: Stage,
  stage: string,
): Promise<void> {
  await db.analysisJob.update({ where: { id: jobId }, data: { status, stage } });
}
