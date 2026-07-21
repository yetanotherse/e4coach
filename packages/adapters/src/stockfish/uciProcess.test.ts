import { describe, it, expect } from 'vitest';
import type { EngineLine } from '@chess-coach/core';
import {
  applyInfoLine,
  collectEval,
  engineSetOptions,
  evalTimeoutMs,
  goCommands,
  parseInfo,
} from './uciProcess.js';

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('engineSetOptions', () => {
  it('interpolates the configured Threads and Hash and pins Chess960 off', () => {
    expect(engineSetOptions(4, 256)).toEqual([
      'setoption name Threads value 4',
      'setoption name Hash value 256',
      'setoption name UCI_Chess960 value false',
    ]);
  });

  it('defaults (1, 16) match the legacy deterministic settings', () => {
    expect(engineSetOptions(1, 16)).toEqual([
      'setoption name Threads value 1',
      'setoption name Hash value 16',
      'setoption name UCI_Chess960 value false',
    ]);
  });
});

describe('goCommands', () => {
  it('sets MultiPV before the position, so the search uses it', () => {
    const cmds = goCommands(FEN, { depth: 20, multiPv: 3 });
    expect(cmds).toEqual([
      'ucinewgame',
      'setoption name MultiPV value 3',
      `position fen ${FEN}`,
      'go depth 20',
    ]);
  });

  it('emits MultiPV value 1 even when unspecified', () => {
    // Regression: engine processes are pooled and reused. If we skipped the
    // setoption for single-PV callers, a process left at MultiPV=3 by the deep
    // pass would silently keep returning 3 lines to shallow evals.
    expect(goCommands(FEN, { depth: 12 })).toContain('setoption name MultiPV value 1');
  });

  it('falls back to movetime when no depth is given', () => {
    expect(goCommands(FEN, { movetimeMs: 250 })).toContain('go movetime 250');
    expect(goCommands(FEN, {})).toContain('go movetime 150');
  });

  it('prefers depth over movetime when both are set', () => {
    expect(goCommands(FEN, { depth: 12, movetimeMs: 250 })).toContain('go depth 12');
  });
});

describe('evalTimeoutMs', () => {
  it('keeps the legacy 30s budget for shallow single-PV searches', () => {
    expect(evalTimeoutMs({ depth: 12 })).toBe(30_000);
    expect(evalTimeoutMs({ movetimeMs: 150 })).toBe(30_000);
  });

  it('scales up for deeper and wider searches', () => {
    // depth 20 / multiPv 3 is the deep-analysis configuration; a flat 30s would
    // abort legitimate searches on a slow box.
    expect(evalTimeoutMs({ depth: 20, multiPv: 3 })).toBeGreaterThan(30_000);
    expect(evalTimeoutMs({ depth: 20, multiPv: 3 })).toBeGreaterThan(
      evalTimeoutMs({ depth: 20, multiPv: 1 }),
    );
  });

  it('caps the budget so a wedged engine still fails', () => {
    expect(evalTimeoutMs({ depth: 30, multiPv: 10 })).toBeLessThanOrEqual(300_000);
  });
});

describe('parseInfo', () => {
  it('extracts multipv alongside score, depth and pv', () => {
    const info = parseInfo('info depth 18 seldepth 24 multipv 2 score cp -35 nodes 900 pv e2e4 e7e5');
    expect(info).toMatchObject({ depth: 18, multipv: 2, cp: -35, pv: ['e2e4', 'e7e5'] });
  });

  it('defaults multipv to absent when Stockfish omits it (single-PV mode)', () => {
    const info = parseInfo('info depth 12 score cp 20 pv d2d4');
    expect(info?.multipv).toBeUndefined();
  });

  it('flags bound scores', () => {
    expect(parseInfo('info depth 9 score cp 15 lowerbound pv e2e4')?.bound).toBe(true);
    expect(parseInfo('info depth 9 score cp 15 upperbound pv e2e4')?.bound).toBe(true);
  });

  it('parses mate scores', () => {
    expect(parseInfo('info depth 5 score mate 3 pv d1h5')).toMatchObject({ mate: 3 });
  });

  it('returns null for info lines carrying neither score nor pv', () => {
    expect(parseInfo('info depth 1 currmove e2e4 currmovenumber 1')).toBeNull();
  });
});

describe('applyInfoLine', () => {
  const acc = (): Map<number, EngineLine> => new Map();

  it('keys lines by multipv index, defaulting to rank 1', () => {
    const a = acc();
    applyInfoLine(a, { depth: 10, cp: 30, pv: ['e2e4'] });
    applyInfoLine(a, { depth: 10, multipv: 2, cp: 10, pv: ['d2d4'] });
    expect(a.get(1)?.pv).toEqual(['e2e4']);
    expect(a.get(2)?.pv).toEqual(['d2d4']);
  });

  it('ignores bound scores', () => {
    const a = acc();
    applyInfoLine(a, { depth: 10, cp: 30, pv: ['e2e4'], bound: true });
    expect(a.size).toBe(0);
  });

  it('ignores lines with no pv or no score', () => {
    const a = acc();
    applyInfoLine(a, { depth: 10, cp: 30, pv: [] });
    applyInfoLine(a, { depth: 10, pv: ['e2e4'] });
    expect(a.size).toBe(0);
  });

  it('overwrites a rank with deeper results but not shallower ones', () => {
    const a = acc();
    applyInfoLine(a, { depth: 18, cp: 50, pv: ['e2e4'] });
    applyInfoLine(a, { depth: 12, cp: 999, pv: ['a2a3'] }); // stale, arrives late
    expect(a.get(1)?.pv).toEqual(['e2e4']);
    applyInfoLine(a, { depth: 20, cp: 60, pv: ['d2d4'] });
    expect(a.get(1)?.pv).toEqual(['d2d4']);
  });

  it('stores mate without cp, and cp without mate', () => {
    const a = acc();
    applyInfoLine(a, { depth: 8, mate: 2, pv: ['d1h5'] });
    expect(a.get(1)).toMatchObject({ mate: 2 });
    expect(a.get(1)?.cp).toBeUndefined();
  });
});

describe('collectEval', () => {
  it('resolves rank 1 into the flat fields for single-PV callers', () => {
    const a = new Map<number, EngineLine>();
    applyInfoLine(a, { depth: 12, cp: 42, pv: ['e2e4', 'e7e5'] });
    const out = collectEval(a, 'e2e4', 1);
    expect(out).toMatchObject({ cp: 42, bestMove: 'e2e4', pv: ['e2e4', 'e7e5'], depth: 12 });
    expect(out.lines).toBeUndefined();
  });

  it('attaches sorted lines when MultiPV was requested', () => {
    const a = new Map<number, EngineLine>();
    // arrive out of order, as Stockfish may emit them
    applyInfoLine(a, { depth: 18, multipv: 3, cp: -10, pv: ['a2a3'] });
    applyInfoLine(a, { depth: 18, multipv: 1, cp: 40, pv: ['e2e4'] });
    applyInfoLine(a, { depth: 18, multipv: 2, cp: 25, pv: ['d2d4'] });
    const out = collectEval(a, 'e2e4', 3);
    expect(out.lines?.map((l) => l.rank)).toEqual([1, 2, 3]);
    expect(out.bestMove).toBe('e2e4');
    expect(out.cp).toBe(40);
  });

  it('drops ranks left at a shallower depth by a cut-off iteration', () => {
    const a = new Map<number, EngineLine>();
    applyInfoLine(a, { depth: 18, multipv: 1, cp: 40, pv: ['e2e4'] });
    applyInfoLine(a, { depth: 14, multipv: 2, cp: 25, pv: ['d2d4'] }); // never re-searched
    const out = collectEval(a, 'e2e4', 3);
    expect(out.lines?.map((l) => l.rank)).toEqual([1]);
  });

  it('returns fewer lines than requested when the position has few legal moves', () => {
    const a = new Map<number, EngineLine>();
    applyInfoLine(a, { depth: 20, multipv: 1, mate: 1, pv: ['h5f7'] });
    const out = collectEval(a, 'h5f7', 5);
    expect(out.lines).toHaveLength(1);
    expect(out.mate).toBe(1);
  });

  it('survives a bestmove with no info lines at all', () => {
    const out = collectEval(new Map(), '(none)', 1);
    expect(out).toMatchObject({ bestMove: '(none)', pv: ['(none)'], depth: 0 });
  });

  it('falls back to the pv head when the bestmove token is missing', () => {
    const a = new Map<number, EngineLine>();
    applyInfoLine(a, { depth: 12, cp: 5, pv: ['g1f3', 'g8f6'] });
    expect(collectEval(a, undefined, 1).bestMove).toBe('g1f3');
  });
});
