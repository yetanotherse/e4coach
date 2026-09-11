/**
 * Evaluate stage (spec §9.1.3). For each user move we need an engine eval of the
 * position before and after the move. Reuse source-provided evals when present
 * (Lichess) to cut engine load; otherwise call the engine once per unique FEN
 * and cache. Returns an EvalLookup the scorer consumes.
 */
import type { ChessEngine, EngineEval, ImportedGame } from '@chess-coach/core';
import { type EvalLookup, type ParsedGame } from '@chess-coach/core';
import type { EvalCachePort } from './evalCache.js';

export interface EvaluateOptions {
  /** fixed search depth — deterministic (preferred) */
  depth?: number;
  /** time budget — non-deterministic fallback when depth is not set */
  movetimeMs?: number;
  /**
   * Cross-job eval cache (plans/phase-2.md 2.2b). Only effective when a fixed
   * depth is set — movetime evals are non-deterministic and never cached.
   */
  evalCache?: EvalCachePort;
}

/**
 * Build an eval lookup for all positions the scorer will ask about. Evaluates
 * each unique FEN at most once. Source-provided evals (game.evals aligned by
 * ply) are used directly when available.
 */
export async function evaluateGame(
  game: ImportedGame,
  parsed: ParsedGame,
  engine: ChessEngine,
  opts: EvaluateOptions,
): Promise<{ lookup: EvalLookup; evalCount: number }> {
  const cache = new Map<string, EngineEval>();

  // Seed from source-provided evals when present (keyed by the position they
  // describe: the FEN *before* the ply that produced them).
  if (game.evals && game.evals.length > 0) {
    for (const ply of parsed.plies) {
      const provided = game.evals[ply.index];
      if (provided) cache.set(ply.fenBefore, provided);
    }
  }

  // Collect the FENs the scorer needs: before + after each user move.
  const needed = new Set<string>();
  for (const ply of parsed.plies) {
    if (!ply.userMove) continue;
    needed.add(ply.fenBefore);
    needed.add(ply.fenAfter);
  }

  // Prefer fixed depth for determinism; fall back to movetime only if no depth.
  const evalOpts = opts.depth ? { depth: opts.depth } : { movetimeMs: opts.movetimeMs };
  // Dispatch all positions at once and let the engine pool bound real
  // concurrency to poolSize. Evaluating serially here would leave every pooled
  // engine but one idle (poolSize has no effect). Each FEN is independent and
  // deterministic (ucinewgame + fixed depth), so order does not matter.
  let toEval = [...needed].filter((fen) => !cache.has(fen));

  // Cross-job cache hits (fixed depth only — deterministic, reproducible).
  // Batched: one query for all FENs (per-fen fan-out exhausts the Prisma pool).
  if (opts.evalCache && opts.depth) {
    const hits = await opts.evalCache.getMany(toEval);
    for (const [fen, hit] of hits) cache.set(fen, hit);
    toEval = toEval.filter((fen) => !cache.has(fen));
  }

  const results = await Promise.all(toEval.map((fen) => engine.evaluate(fen, evalOpts)));
  toEval.forEach((fen, i) => cache.set(fen, results[i]!));
  if (opts.evalCache && opts.depth) {
    await opts.evalCache.setMany(new Map(toEval.map((fen, i) => [fen, results[i]!])));
  }

  return { lookup: (fen: string) => cache.get(fen), evalCount: toEval.length };
}
