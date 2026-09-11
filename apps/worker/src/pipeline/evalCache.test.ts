import { describe, it, expect, vi } from 'vitest';
import type {
  ChessEngine,
  EngineEval,
  EngineEvaluateOptions,
  ImportedGame,
  ParsedGame,
} from '@chess-coach/core';
import { evaluateGame } from './evaluate.js';
import { createDbEvalCache, nullEvalCache, type EvalCachePort } from './evalCache.js';

class CountingEngine implements ChessEngine {
  readonly name = 'counting';
  calls: string[] = [];

  async evaluate(fen: string, _opts: EngineEvaluateOptions): Promise<EngineEval> {
    this.calls.push(fen);
    return { cp: 12, bestMove: 'e2e4', pv: ['e2e4'], depth: 12 };
  }

  async dispose(): Promise<void> {
    /* no-op */
  }
}

function parsedGameWithUserPlies(count: number): ParsedGame {
  const plies = Array.from({ length: count }, (_, i) => ({
    index: i,
    userMove: true,
    fenBefore: `before-${i}`,
    fenAfter: `after-${i}`,
  }));
  return {
    game: { id: 'g1' } as unknown as ImportedGame,
    plies: plies as unknown as ParsedGame['plies'],
  };
}

/** In-memory EvalCachePort stub. */
function memoryCache(): EvalCachePort & { store: Map<string, EngineEval> } {
  const store = new Map<string, EngineEval>();
  return {
    store,
    async get(fen) {
      return store.get(fen) ?? null;
    },
    async set(fen, eval_) {
      store.set(fen, eval_);
    },
    async getMany(fens) {
      const hits = new Map<string, EngineEval>();
      for (const fen of fens) {
        const hit = store.get(fen);
        if (hit) hits.set(fen, hit);
      }
      return hits;
    },
    async setMany(entries) {
      for (const [fen, eval_] of entries) store.set(fen, eval_);
    },
  };
}

describe('evaluateGame + eval cache', () => {
  it('seeds from the cache and skips those engine calls', async () => {
    const engine = new CountingEngine();
    const cache = memoryCache();
    // Pre-seed two of the six FENs.
    const seeded: EngineEval = { cp: 99, bestMove: 'd2d4', pv: ['d2d4'], depth: 12 };
    cache.store.set('before-0', seeded);
    cache.store.set('after-1', seeded);

    const { lookup, evalCount } = await evaluateGame(new ParsedGameHost().game(), parsedGameWithUserPlies(3), engine, {
      depth: 12,
      evalCache: cache,
    });

    expect(evalCount).toBe(4); // 6 FENs − 2 cache hits
    expect(engine.calls).toHaveLength(4);
    expect(lookup('before-0')?.cp).toBe(99); // served from cache
    expect(lookup('after-1')?.cp).toBe(99);
  });

  it('persists fresh evals back into the cache', async () => {
    const engine = new CountingEngine();
    const cache = memoryCache();
    await evaluateGame(new ParsedGameHost().game(), parsedGameWithUserPlies(1), engine, {
      depth: 12,
      evalCache: cache,
    });
    expect(cache.store.size).toBe(2); // before-0 + after-0 written
    expect(cache.store.get('before-0')?.cp).toBe(12);
  });

  it('does not consult the cache without a fixed depth', async () => {
    const engine = new CountingEngine();
    const cache = memoryCache();
    cache.store.set('before-0', { cp: 99, bestMove: 'd2d4', pv: ['d2d4'], depth: 12 });
    const { evalCount } = await evaluateGame(new ParsedGameHost().game(), parsedGameWithUserPlies(1), engine, {
      movetimeMs: 100,
      evalCache: cache,
    });
    expect(evalCount).toBe(2); // movetime evals are non-deterministic → cache ignored
    expect(engine.calls).toHaveLength(2);
  });

  it('nullEvalCache never returns hits', async () => {
    expect(await nullEvalCache.get('x')).toBeNull();
    await expect(nullEvalCache.set('x', { cp: 0, bestMove: 'e2e4', pv: [], depth: 1 })).resolves.toBeUndefined();
  });
});

/** Trivial wrapper to reuse the shared parsed fixture. */
class ParsedGameHost {
  game(): ImportedGame {
    return { id: 'g1' } as unknown as ImportedGame;
  }
}

describe('createDbEvalCache', () => {
  interface FakeRow {
    fen: string;
    depth: number;
    kind: string;
    evalJson: unknown;
  }

  /** Prisma-shaped fake: tracks findMany calls and upsert transaction batches. */
  function fakeDb() {
    const rows = new Map<string, FakeRow>();
    const stats = { findMany: 0, transactions: 0, batchSizes: [] as number[] };
    let failUpserts = false;
    const db = {
      evalCache: {
        findUnique: async ({ where }: { where: { fen_depth_kind: { fen: string } } }) =>
          rows.get(where.fen_depth_kind.fen) ?? null,
        findMany: async ({
          where,
        }: {
          where: { fen: { in: string[] }; depth: number; kind: string };
        }) => {
          stats.findMany++;
          const wanted = new Set(where.fen.in);
          return [...rows.values()].filter(
            (r) => wanted.has(r.fen) && r.depth === where.depth && r.kind === where.kind,
          );
        },
        upsert: async (args: {
          where: { fen_depth_kind: { fen: string } };
          create: { fen: string; depth: number; kind: string; evalJson: unknown };
          update: { evalJson: unknown };
        }) => {
          if (failUpserts) throw new Error('pool timeout');
          const { fen, depth, kind } = args.create;
          rows.set(fen, { fen, depth, kind, evalJson: args.create.evalJson });
          return { ...args.create };
        },
      },
      $transaction: async (ops: Promise<unknown>[]) => {
        stats.transactions++;
        stats.batchSizes.push(ops.length);
        for (const op of ops) await op;
      },
    };
    return { db, rows, stats, setFailUpserts: (v: boolean) => (failUpserts = v) };
  }

  it('getMany returns hits from a single findMany', async () => {
    const { db, stats } = fakeDb();
    const port = createDbEvalCache(db as never, { kind: 'mock', depth: 12 });
    const seeded: EngineEval = { cp: 7, bestMove: 'e2e4', pv: ['e2e4'], depth: 12 };
    await port.setMany(new Map([['fen-a', seeded]]));
    stats.findMany = 0;

    const hits = await port.getMany(['fen-a', 'fen-missing']);

    expect(stats.findMany).toBe(1); // batched: one round trip, not one per FEN
    expect(hits.size).toBe(1);
    expect(hits.get('fen-a')?.cp).toBe(7);
    expect(hits.has('fen-missing')).toBe(false);
  });

  it('getMany with zero FENs does not touch the DB', async () => {
    const { db, stats } = fakeDb();
    const port = createDbEvalCache(db as never, { kind: 'mock', depth: 12 });
    await expect(port.getMany([])).resolves.toEqual(new Map());
    expect(stats.findMany).toBe(0);
  });

  it('setMany writes everything in ≤50-upsert transaction batches', async () => {
    const { db, stats } = fakeDb();
    const port = createDbEvalCache(db as never, { kind: 'mock', depth: 12 });
    const eval_ = (): EngineEval => ({ cp: 0, bestMove: 'e2e4', pv: ['e2e4'], depth: 12 });
    const entries = new Map(
      Array.from({ length: 120 }, (_, i) => [`fen-${i}`, eval_()] as const),
    );

    await port.setMany(entries);

    // 120 entries → 3 sequential batches (50 + 50 + 20) on one connection each.
    expect(stats.transactions).toBe(3);
    expect(stats.batchSizes).toEqual([50, 50, 20]);
    expect(stats.findMany).toBe(0);
    for (const [fen] of entries) {
      expect((await port.get(fen))?.cp).toBe(0);
    }
  });

  it('a failed write batch is swallowed (warn, no throw)', async () => {
    const { db, setFailUpserts } = fakeDb();
    const port = createDbEvalCache(db as never, { kind: 'mock', depth: 12 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setFailUpserts(true);

    await expect(
      port.setMany(new Map([['fen-a', { cp: 0, bestMove: 'e2e4', pv: [], depth: 12 }]])),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('nullEvalCache batches are no-ops', async () => {
    await expect(nullEvalCache.getMany(['x'])).resolves.toEqual(new Map());
    await expect(
      nullEvalCache.setMany(new Map([['x', { cp: 0, bestMove: 'e2e4', pv: [], depth: 1 }]])),
    ).resolves.toBeUndefined();
  });
});
