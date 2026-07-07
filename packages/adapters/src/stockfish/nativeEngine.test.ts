import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { StockfishNativeEngine } from './nativeEngine.js';

/** Locate a Stockfish binary; skip the suite if none is installed. */
function findStockfish(): string | null {
  const candidates = [
    process.env.STOCKFISH_PATH,
    '/opt/homebrew/bin/stockfish',
    '/usr/local/bin/stockfish',
    '/usr/games/stockfish',
    '/usr/bin/stockfish',
  ].filter(Boolean) as string[];
  return candidates.find((p) => existsSync(p)) ?? null;
}

const bin = findStockfish();
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe.skipIf(!bin)('StockfishNativeEngine (integration)', () => {
  it('evaluates the start position and returns a legal best move', async () => {
    const engine = new StockfishNativeEngine({ binPath: bin!, poolSize: 1 });
    try {
      const evalResult = await engine.evaluate(START_FEN, { movetimeMs: 200 });
      expect(evalResult.bestMove).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
      expect(typeof evalResult.cp === 'number' || typeof evalResult.mate === 'number').toBe(true);
      // Start position is roughly balanced.
      if (typeof evalResult.cp === 'number') expect(Math.abs(evalResult.cp)).toBeLessThan(200);
    } finally {
      await engine.dispose();
    }
  }, 15_000);

  it('processes concurrent evaluations through the pool', async () => {
    const engine = new StockfishNativeEngine({ binPath: bin!, poolSize: 2 });
    try {
      const fens = [
        START_FEN,
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      ];
      const results = await Promise.all(fens.map((f) => engine.evaluate(f, { movetimeMs: 150 })));
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.bestMove.length >= 4)).toBe(true);
    } finally {
      await engine.dispose();
    }
  }, 20_000);
});
