/**
 * Evaluate stage (spec §9.1.3). For each user move we need an engine eval of the
 * position before and after the move. Reuse source-provided evals when present
 * (Lichess) to cut engine load; otherwise call the engine once per unique FEN
 * and cache. Returns an EvalLookup the scorer consumes.
 */
import type { ChessEngine, EngineEval, ImportedGame } from '@chess-coach/core';
import { type EvalLookup, type ParsedGame } from '@chess-coach/core';

export interface EvaluateOptions {
  movetimeMs: number;
  depth?: number;
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

  let evalCount = 0;
  for (const fen of needed) {
    if (cache.has(fen)) continue;
    cache.set(fen, await engine.evaluate(fen, { movetimeMs: opts.movetimeMs, depth: opts.depth }));
    evalCount++;
  }

  return { lookup: (fen: string) => cache.get(fen), evalCount };
}
