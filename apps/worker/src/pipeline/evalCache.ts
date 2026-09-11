/**
 * DB-backed engine-eval cache (plans/phase-2.md 2.2b). Fixed-depth evals are
 * deterministic, so (fen, depth, kind) → eval persists across jobs. Only used
 * with a fixed depth — movetime budgets are non-deterministic and must not be
 * cached. Failures are swallowed: a cache outage just means re-evaluating.
 */
import type { EngineEval } from '@chess-coach/core';
import type { PrismaClient } from '@chess-coach/db';

export interface EvalCachePort {
  get(fen: string): Promise<EngineEval | null>;
  set(fen: string, eval_: EngineEval): Promise<void>;
}

export function createDbEvalCache(
  db: PrismaClient,
  opts: { kind: string; depth: number },
): EvalCachePort {
  const key = (fen: string) => ({ fen_depth_kind: { fen, depth: opts.depth, kind: opts.kind } });
  return {
    async get(fen: string): Promise<EngineEval | null> {
      try {
        const row = await db.evalCache.findUnique({ where: key(fen) });
        return (row?.evalJson as EngineEval | undefined) ?? null;
      } catch {
        return null;
      }
    },
    async set(fen: string, eval_: EngineEval): Promise<void> {
      try {
        await db.evalCache.upsert({
          where: key(fen),
          create: { fen, depth: opts.depth, kind: opts.kind, evalJson: eval_ as object },
          update: { evalJson: eval_ as object },
        });
      } catch (err) {
        console.warn(`[eval-cache] write failed for ${fen}:`, err instanceof Error ? err.message : err);
      }
    },
  };
}

/** Null-object cache (no persistence) — the explicit "cache disabled" value. */
export const nullEvalCache: EvalCachePort = {
  async get() {
    return null;
  },
  async set() {
    /* no-op */
  },
};
