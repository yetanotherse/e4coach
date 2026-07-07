import { describe, it, expect } from 'vitest';
import { parseGame } from './parse.js';
import type { ImportedGame } from '../types.js';

function game(pgn: string, overrides: Partial<ImportedGame> = {}): ImportedGame {
  return {
    id: 'g',
    pgn,
    white: 'mockuser',
    black: 'opp',
    userColor: 'white',
    result: '1-0',
    timeControl: '300+0',
    playedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('parseGame', () => {
  it('marks the correct side as user moves', () => {
    const parsed = parseGame(game('1. e4 e5 2. Nf3 Nc6'));
    const userSans = parsed.plies.filter((p) => p.userMove).map((p) => p.san);
    expect(userSans).toEqual(['e4', 'Nf3']);
  });

  it('assigns opening/endgame phases from move number and piece count', () => {
    const parsed = parseGame(game('1. e4 e5 2. Nf3 Nc6'));
    expect(parsed.plies[0]!.phase).toBe('opening');
  });

  it('detects user material loss when the opponent wins a piece next ply', () => {
    // White plays Nf3?? then ...exf3-ish? Construct: white hangs the knight.
    // 1.e4 e5 2.Nf3 Nc6 3.Ng5 h6 4.Nf3 ... instead give a real hang:
    // 1. e4 d5 2. exd5 Qxd5 3. Nc3 Qe5+? then 4. Be2 -> not a hang.
    // Simplest concrete hang: 1. e4 e5 2. Qh5 Nc6 3. Bc4 g6 4. Qf3 Nd4 5. Qxf7+?? — no.
    // Use: white leaves bishop en prise: 1. e4 e5 2. Bc4 Nf6 3. Bxf7+? Kxf7 (user=white loses bishop for pawn)
    const parsed = parseGame(game('1. e4 e5 2. Bc4 Nf6 3. Bxf7+ Kxf7'));
    // The user's move 3.Bxf7+ (a capture of a pawn) is answered by ...Kxf7 winning the bishop.
    const bxf7 = parsed.plies.find((p) => p.san === 'Bxf7+')!;
    expect(bxf7.userMove).toBe(true);
    // Opponent recaptures the bishop (value 3), user captured a pawn (1) → net loss 3.
    expect(bxf7.userMaterialLossNextPly).toBe(3);
  });

  it('throws on malformed PGN so the pipeline can isolate it', () => {
    expect(() => parseGame(game('1. e4 e5 2. Zz9 ??'))).toThrow();
  });
});
