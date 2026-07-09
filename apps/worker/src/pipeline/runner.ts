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
  type EmbeddedGame,
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
  /** cap on games analyzed for pre-stored sources (studies/PGN) */
  maxAnalyzed: number;
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

    // ── Stage 1: obtain games ───────────────────────────────────────
    // Pre-stored sources (studies) load from the DB; live sources fetch.
    await setStage(db, job.id, 'FETCHING', 'gathering games');
    let games: ImportedGame[];
    let requestedMax: number;
    let perfTypes: string[];
    if (job.source === 'lichess-study') {
      games = await loadStoredGames(db, job.id, deps.maxAnalyzed);
      requestedMax = deps.maxAnalyzed;
      perfTypes = job.params?.perfTypes?.length ? job.params.perfTypes : [];
    } else {
      requestedMax = Math.min(job.params?.maxGames ?? deps.maxGames, deps.maxGames);
      perfTypes = job.params?.perfTypes?.length ? job.params.perfTypes : DEFAULT_PERF_TYPES;
      games = await deps.gameSource.fetchRecentGames(user.lichessUser, {
        max: requestedMax,
        rated: true,
        perfTypes,
      });
    }
    if (games.length === 0) throw new Error('no games to analyze');
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
    // Embed the games cited by examples so the in-app stepper works without
    // auth (study source only; live sources deep-link out instead).
    if (job.source === 'lichess-study') {
      content.games = collectReferencedGames(profile, games);
    }

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

/** Load pre-imported games (study/PGN sources) from the DB as ImportedGames. */
async function loadStoredGames(
  db: PrismaClient,
  jobId: string,
  cap: number,
): Promise<ImportedGame[]> {
  const rows = await db.game.findMany({
    where: { jobId },
    orderBy: { playedAt: 'desc' },
    take: cap,
  });
  return rows.map((r) => ({
    id: r.externalId,
    pgn: r.pgn,
    white: r.white,
    black: r.black,
    userColor: r.userColor === 'black' ? 'black' : 'white',
    result: r.result,
    timeControl: r.timeControl,
    ...(r.speed ? { speed: r.speed } : {}),
    playedAt: r.playedAt.toISOString(),
  }));
}

/** Games cited by the top-weakness examples, keyed by id, for the in-app stepper. */
function collectReferencedGames(
  profile: WeaknessProfile,
  games: ImportedGame[],
): Record<string, EmbeddedGame> {
  const byId = new Map(games.map((g) => [g.id, g]));
  const out: Record<string, EmbeddedGame> = {};
  for (const cat of profile.topWeaknesses) {
    const stat = profile.categories.find((c) => c.category === cat);
    for (const ex of stat?.examples ?? []) {
      const g = byId.get(ex.gameId);
      if (g && !out[ex.gameId]) {
        const event = g.pgn.match(/\[Event\s+"([^"]*)"\]/)?.[1];
        out[ex.gameId] = {
          pgn: g.pgn,
          userColor: g.userColor,
          white: g.white,
          black: g.black,
          ...(event && event !== '?' ? { event } : {}),
        };
      }
    }
  }
  return out;
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
