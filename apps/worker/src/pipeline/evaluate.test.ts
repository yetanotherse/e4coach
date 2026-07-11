import { describe, it, expect } from 'vitest';
import type {
  ChessEngine,
  EngineEval,
  EngineEvaluateOptions,
  ImportedGame,
  ParsedGame,
} from '@chess-coach/core';
import { evaluateGame } from './evaluate.js';

/**
 * Fake engine that records how many evaluate() calls are in flight at once, so
 * we can prove evaluateGame dispatches positions concurrently (and never
 * regresses to a serial await loop that would idle a real engine pool).
 */
class ConcurrencyProbeEngine implements ChessEngine {
  readonly name = 'probe';
  inFlight = 0;
  maxConcurrent = 0;
  calls: string[] = [];

  async evaluate(fen: string, _opts: EngineEvaluateOptions): Promise<EngineEval> {
    this.calls.push(fen);
    this.inFlight++;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.inFlight);
    await new Promise((r) => setTimeout(r, 5)); // hold the slot so overlaps are observable
    this.inFlight--;
    return { cp: 0, bestMove: 'e2e4', pv: ['e2e4'], depth: 12 };
  }

  async dispose(): Promise<void> {
    /* no-op */
  }
}

/** Minimal ParsedGame: evaluateGame only reads index/userMove/fenBefore/fenAfter. */
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

describe('evaluateGame', () => {
  it('dispatches positions concurrently so the engine pool is utilized', async () => {
    const engine = new ConcurrencyProbeEngine();
    const parsed = parsedGameWithUserPlies(3); // 3 user plies → 6 unique FENs
    const game = { id: 'g1' } as unknown as ImportedGame;

    const { lookup, evalCount } = await evaluateGame(game, parsed, engine, { depth: 14 });

    expect(evalCount).toBe(6);
    expect(engine.maxConcurrent).toBeGreaterThanOrEqual(2); // proves parallel dispatch
    for (let i = 0; i < 3; i++) {
      expect(lookup(`before-${i}`)).toBeDefined();
      expect(lookup(`after-${i}`)).toBeDefined();
    }
  });

  it('does not re-evaluate FENs already provided by the source', async () => {
    const engine = new ConcurrencyProbeEngine();
    // One user ply → before/after FENs; seed the "before" via source evals.
    const parsed = parsedGameWithUserPlies(1);
    const game = {
      id: 'g1',
      evals: [{ cp: 42, bestMove: 'e2e4', pv: ['e2e4'], depth: 20 }],
    } as unknown as ImportedGame;

    const { lookup, evalCount } = await evaluateGame(game, parsed, engine, { depth: 14 });

    expect(evalCount).toBe(1); // only fenAfter needed the engine
    expect(engine.calls).toEqual(['after-0']);
    expect(lookup('before-0')?.cp).toBe(42); // reused the source eval
  });
});
