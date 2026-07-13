import { describe, it, expect } from 'vitest';
import type { GameContext, DetectorMove } from '../detectors/index.js';
import type { ErrorInstance } from '../profile.js';
import { aggregatePositionTypes } from './positionAggregate.js';

const ROOK_EG = '4r1k1/pp3ppp/8/8/8/8/PP3PPP/4R1K1 w - - 0 1'; // ROOK_ENDGAME + QUEENLESS + OPEN_FILE
const NEUTRAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1'; // no structural tags

/** aggregatePositionTypes only reads fenBefore + severity off each move. */
const move = (fenBefore: string, severity?: 'mistake' | 'blunder'): DetectorMove =>
  ({ fenBefore, severity }) as unknown as DetectorMove;

const ctx = (moves: DetectorMove[]): GameContext =>
  ({ game: { id: 'g1', userColor: 'white' }, moves }) as unknown as GameContext;

const instance = (fen: string, ply: number): ErrorInstance =>
  ({
    category: 'HANGING_PIECE',
    gameId: 'g1',
    moveNumber: ply,
    ply,
    fen,
    playedMove: 'Rd1',
    betterMove: 'e2e4',
    cpl: 200,
    cpBefore: 10,
    cpAfter: -190,
    assessment: 'roughly equal (0.1)',
    userColor: 'white',
    note: '',
  }) as ErrorInstance;

describe('aggregatePositionTypes', () => {
  it('flags a type where the user errs above baseline, with rate/lift and examples', () => {
    // 30 rook-endgame moves (9 mistakes → 30%) + 30 neutral moves (3 mistakes).
    // Baseline = 12/60 = 20%. Rook lift = 0.30 / 0.20 = 1.5.
    const rookMoves = Array.from({ length: 30 }, (_, i) => move(ROOK_EG, i < 9 ? 'blunder' : undefined));
    const neutralMoves = Array.from({ length: 30 }, (_, i) => move(NEUTRAL, i < 3 ? 'mistake' : undefined));
    const instances = [instance(ROOK_EG, 20), instance(ROOK_EG, 40)];

    const stats = aggregatePositionTypes([ctx([...rookMoves, ...neutralMoves])], instances);

    const rook = stats.find((s) => s.type === 'ROOK_ENDGAME');
    expect(rook).toBeDefined();
    expect(rook!.movesInType).toBe(30);
    expect(rook!.mistakesInType).toBe(9);
    expect(rook!.rate).toBeCloseTo(0.3, 5);
    expect(rook!.baselineRate).toBeCloseTo(0.2, 5);
    expect(rook!.lift).toBeCloseTo(1.5, 5);
    expect(rook!.examples.length).toBe(2); // capped at 3, both provided instances qualify
    // Neutral positions carry no structural tags, so never appear.
    expect(stats.every((s) => s.movesInType >= 25)).toBe(true);
  });

  it('suppresses types below the minimum move-count guard', () => {
    // Only 10 rook-endgame moves — below MIN_MOVES_IN_TYPE (25) — so nothing is reported.
    const rookMoves = Array.from({ length: 10 }, (_, i) => move(ROOK_EG, i < 5 ? 'blunder' : undefined));
    const neutralMoves = Array.from({ length: 40 }, () => move(NEUTRAL));
    const stats = aggregatePositionTypes([ctx([...rookMoves, ...neutralMoves])], []);
    expect(stats.find((s) => s.type === 'ROOK_ENDGAME')).toBeUndefined();
  });

  it('returns nothing when there are no mistakes at all', () => {
    const moves = Array.from({ length: 40 }, () => move(ROOK_EG));
    expect(aggregatePositionTypes([ctx(moves)], [])).toEqual([]);
  });
});
