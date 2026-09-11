import { describe, it, expect } from 'vitest';
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
  it('builds a port wired to a prisma-shaped client', async () => {
    // Only shape-checking here: DB integration is exercised in live smoke.
    const fake = {} as never;
    const port = createDbEvalCache(fake, { kind: 'mock', depth: 12 });
    expect(typeof port.get).toBe('function');
    expect(typeof port.set).toBe('function');
  });
});
