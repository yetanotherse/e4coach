/**
 * DB-backed engine-eval cache (plans/phase-2.md 2.2b). Fixed-depth evals are
 * deterministic, so (fen, depth, kind) → eval persists across jobs. Only used
 * with a fixed depth — movetime budgets are non-deterministic and must not be
 * cached. Failures are swallowed: a cache outage just means re-evaluating.
 *
 * A game needs ~2 evals per user ply, so per-fen get/set fanned out through
 * Promise.all would burst 100+ concurrent queries against Prisma's small
 * connection pool (cores×2+1, 10s acquire timeout) and time out — seen live
 * against the Supabase transaction pooler on the first game of a job. Hence
 * the batched getMany/setMany: one round trip for reads, sequential writes
 * inside a single $transaction (one connection).
 */
import type { EngineEval } from '@chess-coach/core';
import type { PrismaClient } from '@chess-coach/db';

export interface EvalCachePort {
  get(fen: string): Promise<EngineEval | null>;
  set(fen: string, eval_: EngineEval): Promise<void>;
  /** Batch reads: one round trip instead of one per FEN. */
  getMany(fens: string[]): Promise<Map<string, EngineEval>>;
  /** Batch writes: bounded-chunk transaction instead of one upsert per FEN. */
  setMany(entries: ReadonlyMap<string, EngineEval>): Promise<void>;
}

/** Max upserts per $transaction batch — sequential on one connection each. */
const WRITE_CHUNK = 50;

export function createDbEvalCache(
  db: PrismaClient,
  opts: { kind: string; depth: number },
): EvalCachePort {
  const key = (fen: string) => ({ fen_depth_kind: { fen, depth: opts.depth, kind: opts.kind } });
  const warn = (stage: string, err: unknown): void => {
    console.warn(`[eval-cache] ${stage} failed:`, err instanceof Error ? err.message : err);
  };
  return {
    async get(fen: string): Promise<EngineEval | null> {
      try {
        const row = await db.evalCache.findUnique({ where: key(fen) });
        return (row?.evalJson as unknown as EngineEval | undefined) ?? null;
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
        warn(`write failed for ${fen}`, err);
      }
    },
    async getMany(fens: string[]): Promise<Map<string, EngineEval>> {
      const hits = new Map<string, EngineEval>();
      if (fens.length === 0) return hits;
      try {
        const rows = await db.evalCache.findMany({
          where: { fen: { in: fens }, depth: opts.depth, kind: opts.kind },
        });
        for (const row of rows) {
          const eval_ = row.evalJson as unknown as EngineEval | undefined;
          if (eval_) hits.set(row.fen, eval_);
        }
      } catch (err) {
        warn(`read failed for ${fens.length} fen(s)`, err);
      }
      return hits;
    },
    async setMany(entries: ReadonlyMap<string, EngineEval>): Promise<void> {
      const fens = [...entries.keys()];
      for (let i = 0; i < fens.length; i += WRITE_CHUNK) {
        const chunk = fens.slice(i, i + WRITE_CHUNK);
        try {
          // Array-form $transaction runs the upserts sequentially over ONE
          // connection — bounded pool usage regardless of batch size.
          await db.$transaction(
            chunk.map((fen) =>
              db.evalCache.upsert({
                where: key(fen),
                create: {
                  fen,
                  depth: opts.depth,
                  kind: opts.kind,
                  evalJson: entries.get(fen)! as object,
                },
                update: { evalJson: entries.get(fen)! as object },
              }),
            ),
          );
        } catch (err) {
          warn(`write failed for a batch of ${chunk.length}`, err);
        }
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
  async getMany() {
    return new Map();
  },
  async setMany() {
    /* no-op */
  },
};
