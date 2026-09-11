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
import { deepenProfile, type DeepenOptions } from './deepen.js';
import { narrateExplanations } from './explain.js';
import { generateReport } from './generate.js';
import { generateTrainingPlan } from './plan.js';
import { generateSlug } from './slug.js';
import { sendReportReadyEmail } from './notify.js';

export interface RunDeps {
  db?: PrismaClient;
  gameSource: GameSource;
  /** chess.com live source (plans/phase-2.md 2.1); used when job.source === 'chesscom' */
  chessComSource?: GameSource;
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
  /** fixed search depth — deterministic analysis (preferred over movetime) */
  depth: number;
  movetimeMs: number;
  /** deep explanation pass; omitted or disabled leaves examples with `note` only */
  deepen?: DeepenOptions & { enabled: boolean };
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

/** Token spend for the explanation stage, recorded per job for cost tracking. */
interface LlmTokens {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Sources whose games are pre-inserted as Game rows (loaded from the DB) rather
 * than fetched live: Lichess studies and direct PGN uploads. These share the
 * stored-games path (load + cap by maxAnalyzed) and embed games into the report.
 */
function isStoredSource(source: string): boolean {
  return source === 'lichess-study' || source === 'pgn';
}

export interface UserRecord {
  id: string;
  email: string;
  emailHash: string | null;
  lichessUser: string | null;
  chessComUser: string | null;
}

/** Run a single job end-to-end. Returns the created report's public slug. */
export async function runJob(job: JobRecord, user: UserRecord, deps: RunDeps): Promise<string> {
  const db = deps.db ?? prisma;
  const distinctId = user.emailHash ?? user.id;
  const engineMeta: WeaknessProfile['engineMeta'] = {
    kind: deps.engine.name,
    depth: deps.depth,
  };

  const stored = isStoredSource(job.source);
  const isChessCom = job.source === 'chesscom';
  // Live sources need an account on their platform to fetch from; stored
  // sources (studies, PGN uploads) already have their games in the DB and may
  // have no username. PGN uploads aren't tied to any account — the user could
  // have a stale lichessUser on their row from an earlier flow — so always
  // address them as "you" rather than leaking an unrelated username.
  const displayName =
    job.source === 'pgn' ? 'you' : (user.lichessUser ?? user.email.split('@')[0] ?? 'You');

  try {
    if (!stored) {
      const username = isChessCom ? user.chessComUser : user.lichessUser;
      if (!username) {
        throw new Error(isChessCom ? 'user has no chess.com username' : 'user has no lichess username');
      }
      if (isChessCom && !deps.chessComSource) {
        throw new Error('chess.com game source not configured on this worker');
      }
    }

    // ── Stage 1: obtain games ───────────────────────────────────────
    // Pre-stored sources (studies, PGN uploads) load from the DB; live sources fetch.
    await setStage(db, job.id, 'FETCHING', 'gathering games');
    let games: ImportedGame[];
    let requestedMax: number;
    let perfTypes: string[];
    if (stored) {
      games = await loadStoredGames(db, job.id, deps.maxAnalyzed);
      requestedMax = deps.maxAnalyzed;
      perfTypes = job.params?.perfTypes?.length ? job.params.perfTypes : [];
    } else {
      requestedMax = Math.min(job.params?.maxGames ?? deps.maxGames, deps.maxGames);
      perfTypes = job.params?.perfTypes?.length ? job.params.perfTypes : DEFAULT_PERF_TYPES;
      // Make the cap chain visible: if this says "cap 20" the worker's
      // MAX_GAMES_PER_JOB env is still 20 (worker.env not reloaded).
      console.log(
        `[runner] job ${job.id} live fetch: up to ${requestedMax} (selected ${job.params?.maxGames ?? 'default'}, cap ${deps.maxGames})`,
      );
      const liveSource = isChessCom ? deps.chessComSource : deps.gameSource;
      const username = isChessCom ? user.chessComUser : user.lichessUser;
      games = await liveSource!.fetchRecentGames(username!, {
        max: requestedMax,
        rated: true,
        perfTypes,
      });
    }
    if (games.length === 0) throw new Error('no games to analyze');
    console.log(`[runner] job ${job.id} fetched ${games.length} game(s)`);
    await db.analysisJob.update({ where: { id: job.id }, data: { gameCount: games.length } });

    // ── Stages 2-4: parse → evaluate → classify (per game, isolated) ─
    await setStage(db, job.id, 'EVALUATING', 'evaluating positions');
    // Heartbeat after each game so the row's updatedAt stays fresh through the
    // long EVALUATING stage — that's how stale-job recovery tells a live job
    // (progressing) from one stranded by a killed worker. Failures are ignored
    // (a missed heartbeat must not fail the job).
    const heartbeat = async (done: number, total: number): Promise<void> => {
      await db.analysisJob
        .update({ where: { id: job.id }, data: { stage: `evaluating game ${done}/${total}` } })
        .catch(() => {});
    };
    const { contexts, movesScored, evalCount, skipped } = await analyzeGames(
      games,
      deps,
      heartbeat,
    );

    await setStage(db, job.id, 'CLASSIFYING', 'classifying weaknesses');
    const scope = buildScope(games, contexts.length, skipped, requestedMax, perfTypes);
    const baseProfile = aggregateProfile({
      username: displayName,
      source: job.source,
      contexts,
      movesScored,
      engineMeta,
      maxExamples: deps.maxExamples,
      scope,
    });

    // ── Stage 4b: explain the mistakes we're about to show ──────────
    // Deeper, MultiPV re-analysis of only the displayed examples, so each one
    // can say WHY the engine's move was better. Reuses the CLASSIFYING status
    // (a new JobStatus enum value would need a migration deployed strictly
    // before the worker) and reports progress through the free-text stage.
    const { profile, llmTokens } = await explainMistakes(db, job.id, baseProfile, deps);

    // ── Stage 5: generate report ────────────────────────────────────
    await setStage(db, job.id, 'GENERATING', 'writing your report');
    const content = await generateReport(profile, deps.llm);
    // Embed the games cited by examples so the in-app stepper works without
    // auth (stored sources only; live sources deep-link out instead).
    if (stored) {
      content.games = collectReferencedGames(profile, games);
    }

    // ── Stage 6: persist ────────────────────────────────────────────
    const slug = generateSlug();
    const report = await db.report.create({
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
      data: {
        status: 'DONE',
        stage: 'done',
        engineMeta: {
          ...engineMeta,
          evalCount,
          skipped,
          ...(llmTokens ? { llmTokens } : {}),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await deps.analytics.capture(distinctId, 'job_completed', {
      jobId: job.id,
      games: games.length,
      movesScored,
      skipped,
    });

    // ── Stage 7: this week's training plan (optional upgrade) ──────
    // Built from the same profile; failure here must not fail the job (the
    // report is already persisted). The plan page reads it via the report.
    try {
      await generateTrainingPlan(
        db,
        { userId: user.id, profile, reportId: report.id },
        deps.llm,
      );
    } catch (err) {
      console.warn(
        `[runner] job ${job.id} plan generation failed (report unaffected):`,
        err instanceof Error ? err.message : err,
      );
    }

    // Notify the user their report is ready. Email failure must not fail the job.
    try {
      await sendReportReadyEmail(deps.mailer, user.email, `${deps.appUrl}/report/${slug}`);
    } catch (err) {
      console.warn('[runner] report-ready email failed:', err instanceof Error ? err.message : err);
    }
    console.log(
      `[runner] job ${job.id} DONE → /report/${slug} (${evalCount} evals, ${skipped} skipped)`,
    );
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

/**
 * Attach engine-grounded explanations to the examples the report will show.
 *
 * Entirely optional: if it is disabled or fails, examples keep their existing
 * deterministic `note` and the job proceeds. A failure here must never cost the
 * user their report.
 */
async function explainMistakes(
  db: PrismaClient,
  jobId: string,
  profile: WeaknessProfile,
  deps: RunDeps,
): Promise<{ profile: WeaknessProfile; llmTokens?: LlmTokens }> {
  if (!deps.deepen?.enabled) return { profile };
  try {
    await db.analysisJob
      .update({ where: { id: jobId }, data: { stage: 'studying your mistakes' } })
      .catch(() => {});
    const started = Date.now();
    const { profile: enriched, facts, enrichments } = await deepenProfile(
      profile,
      deps.engine,
      deps.deepen,
      async (done, total) => {
        await db.analysisJob
          .update({
            where: { id: jobId },
            data: { stage: `studying your mistakes ${done}/${total}` },
          })
          .catch(() => {});
      },
    );
    console.log(
      `[runner] job ${jobId} explained ${facts.size} position(s) in ${Date.now() - started}ms`,
    );

    // Rephrase the deterministic prose in a coach's voice. Strictly an upgrade:
    // anything the model cannot safely improve keeps the engine-derived text.
    const narrated = await narrateExplanations(enriched, facts, deps.llm, enrichments);
    if (narrated.narrated > 0) {
      console.log(
        `[runner] job ${jobId} narrated ${narrated.narrated}/${facts.size} explanation(s) ` +
          `(${narrated.usage.inputTokens} in / ${narrated.usage.outputTokens} out tokens)`,
      );
    }
    return { profile: narrated.profile, llmTokens: narrated.usage };
  } catch (err) {
    console.warn(
      `[runner] job ${jobId} deep analysis failed, continuing without explanations:`,
      err instanceof Error ? err.message : err,
    );
    return { profile };
  }
}

interface AnalyzeResult {
  contexts: GameContext[];
  movesScored: number;
  evalCount: number;
  skipped: number;
}

/** Parse + evaluate + score each game, isolating per-game failures. */
async function analyzeGames(
  games: ImportedGame[],
  deps: RunDeps,
  heartbeat?: (done: number, total: number) => Promise<void>,
): Promise<AnalyzeResult> {
  const contexts: GameContext[] = [];
  let movesScored = 0;
  let evalCount = 0;
  let skipped = 0;

  let index = 0;
  for (const game of games) {
    index++;
    try {
      const parsed = parseGame(game);
      console.log(
        `[runner] evaluating game ${index}/${games.length} (${game.id}, ${parsed.plies.length} plies)`,
      );
      const started = Date.now();
      const { lookup, evalCount: n } = await evaluateGame(game, parsed, deps.engine, {
        depth: deps.depth,
      });
      evalCount += n;
      const moves = scoreUserMoves(parsed, lookup);
      movesScored += moves.length;
      contexts.push({ game, moves, plies: parsed.plies });
      console.log(
        `[runner]   done game ${index}/${games.length} in ${Date.now() - started}ms (${n} evals)`,
      );
    } catch (err) {
      // One bad game must not fail the whole job (spec §11.4).
      skipped++;
      console.warn(`[runner] skipped game ${game.id}:`, err instanceof Error ? err.message : err);
    }
    await heartbeat?.(index, games.length);
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
  const dates = games
    .map((g) => g.playedAt)
    .filter(Boolean)
    .sort();
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
    // Stable ordering so the analyzed subset is identical every run even when
    // many games share a date (common for OTB study imports) and count > cap.
    orderBy: [{ playedAt: 'desc' }, { externalId: 'asc' }, { id: 'asc' }],
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
          ...(g.speed ? { speed: g.speed } : {}),
          ...(g.timeControl && g.timeControl !== 'unknown' ? { timeControl: g.timeControl } : {}),
        };
      }
    }
  }
  return out;
}

type Stage = 'FETCHING' | 'EVALUATING' | 'CLASSIFYING' | 'GENERATING';

async function setStage(
  db: PrismaClient,
  jobId: string,
  status: Stage,
  stage: string,
): Promise<void> {
  console.log(`[runner] job ${jobId} → ${status} (${stage})`);
  await db.analysisJob.update({ where: { id: jobId }, data: { status, stage } });
}
