import { describe, it, expect } from 'vitest';
import {
  cpFromEval,
  winProbability,
  classifySeverity,
  scoreUserMoves,
  BLUNDER_CP,
} from './cpl.js';
import { parseGame } from './parse.js';
import type { EngineEval, ImportedGame } from '../types.js';

describe('winProbability', () => {
  it('is 0.5 at cp 0 and monotonic', () => {
    expect(winProbability(0)).toBeCloseTo(0.5, 5);
    expect(winProbability(300)).toBeGreaterThan(winProbability(0));
    expect(winProbability(-300)).toBeLessThan(winProbability(0));
  });
});

describe('cpFromEval', () => {
  it('maps mate to a large signed value', () => {
    expect(cpFromEval({ mate: 3, bestMove: 'a', pv: [], depth: 1 })).toBeGreaterThan(1000);
    expect(cpFromEval({ mate: -2, bestMove: 'a', pv: [], depth: 1 })).toBeLessThan(-1000);
  });
  it('clamps extreme cp values', () => {
    expect(cpFromEval({ cp: 999999, bestMove: 'a', pv: [], depth: 1 })).toBe(2000);
  });
});

describe('classifySeverity', () => {
  it('requires both cp and win-probability drop', () => {
    // Big cp swing but tiny win-prob change (already lost) → not a blunder.
    expect(classifySeverity(BLUNDER_CP + 100, 0.01)).toBeUndefined();
    // Big cp swing with a real win-prob drop → blunder.
    expect(classifySeverity(BLUNDER_CP + 100, 0.4)).toBe('blunder');
    expect(classifySeverity(120, 0.15)).toBe('mistake');
    expect(classifySeverity(60, 0.06)).toBe('inaccuracy');
    expect(classifySeverity(10, 0.01)).toBeUndefined();
  });
});

describe('scoreUserMoves', () => {
  const game: ImportedGame = {
    id: 'g1',
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6',
    white: 'mockuser',
    black: 'opp',
    userColor: 'white',
    result: '1-0',
    timeControl: '300+0',
    playedAt: '2026-07-01T00:00:00.000Z',
  };

  it('scores only user moves that have evals for both positions', () => {
    const parsed = parseGame(game);
    // Provide a flat 0-eval for every position → cpl 0, no severity.
    const flat: EngineEval = { cp: 0, bestMove: 'e2e4', pv: [], depth: 12 };
    const scored = scoreUserMoves(parsed, () => flat);
    // White (user) played e4, Nf3, Bb5 → 3 user moves.
    expect(scored).toHaveLength(3);
    expect(scored.every((m) => m.cpl === 0)).toBe(true);
    expect(scored.every((m) => m.severity === undefined)).toBe(true);
  });

  it('computes centipawn loss from user perspective', () => {
    const parsed = parseGame(game);
    const firstUserFenBefore = parsed.plies.find((p) => p.userMove)!.fenBefore;
    const lookup = (fen: string): EngineEval => {
      // User was +150 before the move, opponent is +150 after (i.e. user -150).
      if (fen === firstUserFenBefore) return { cp: 150, bestMove: 'd2d4', pv: [], depth: 12 };
      return { cp: 150, bestMove: 'x', pv: [], depth: 12 };
    };
    const scored = scoreUserMoves(parsed, lookup);
    const first = scored[0]!;
    expect(first.cpBefore).toBe(150);
    expect(first.cpAfter).toBe(-150); // negated opponent POV
    expect(first.cpl).toBe(300);
  });
});
