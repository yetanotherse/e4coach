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

  it('returns ranked alternative lines when MultiPV is requested', async () => {
    const engine = new StockfishNativeEngine({ binPath: bin!, poolSize: 1 });
    try {
      const res = await engine.evaluate(START_FEN, { depth: 12, multiPv: 3 });
      expect(res.lines).toHaveLength(3);
      expect(res.lines!.map((l) => l.rank)).toEqual([1, 2, 3]);
      // Rank 1 must agree with the flat fields single-PV callers read.
      expect(res.lines![0]!.pv[0]).toBe(res.bestMove);
      expect(res.lines![0]!.cp).toBe(res.cp);
      // Ranked worst-to-best from the mover's perspective: rank 1 >= rank 2 >= rank 3.
      const cps = res.lines!.map((l) => l.cp!);
      expect(cps[0]!).toBeGreaterThanOrEqual(cps[1]!);
      expect(cps[1]!).toBeGreaterThanOrEqual(cps[2]!);
      expect(res.lines!.every((l) => l.pv.length > 0)).toBe(true);
    } finally {
      await engine.dispose();
    }
  }, 20_000);

  it('caps lines at the number of legal moves', async () => {
    // Only one legal move: the king must capture the checking queen.
    const fen = '7k/8/8/8/8/8/5q2/6K1 w - - 0 1';
    const engine = new StockfishNativeEngine({ binPath: bin!, poolSize: 1 });
    try {
      const res = await engine.evaluate(fen, { depth: 8, multiPv: 5 });
      expect(res.lines!.length).toBeLessThanOrEqual(2);
      expect(res.bestMove).toBe('g1f2');
    } finally {
      await engine.dispose();
    }
  }, 20_000);

  it('does not leak MultiPV onto a pooled process reused by a later eval', async () => {
    // Regression: processes are reused across jobs. A deep MultiPV eval must not
    // leave the option set for the shallow single-PV evals that follow.
    const engine = new StockfishNativeEngine({ binPath: bin!, poolSize: 1 });
    try {
      await engine.evaluate(START_FEN, { depth: 12, multiPv: 3 });
      const after = await engine.evaluate(START_FEN, { depth: 12 });
      expect(after.lines).toBeUndefined();
    } finally {
      await engine.dispose();
    }
  }, 20_000);

  it('is deterministic at a fixed depth (same fen → same eval, even via the pool)', async () => {
    const fen = 'r2q1rk1/1b1nbppp/p2ppn2/1p6/3NP3/1BN1B3/PPP1QPPP/R4RK1 w - - 0 12';
    const engine = new StockfishNativeEngine({ binPath: bin!, poolSize: 3 });
    try {
      // Evaluate the same position many times across the pool; all must agree.
      const runs = await Promise.all(
        Array.from({ length: 6 }, () => engine.evaluate(fen, { depth: 14 })),
      );
      const first = runs[0]!;
      for (const r of runs) {
        expect(r.bestMove).toBe(first.bestMove);
        expect(r.cp).toBe(first.cp);
        expect(r.mate).toBe(first.mate);
      }
    } finally {
      await engine.dispose();
    }
  }, 30_000);
});
