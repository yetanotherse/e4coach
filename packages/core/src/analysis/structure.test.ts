import { describe, it, expect } from 'vitest';
import { positionTypesForFen, type PositionType } from './structure.js';

/** Only the placement field matters; a trailing " w" keeps the FENs readable. */
const tags = (placement: string, color: 'white' | 'black' = 'white'): PositionType[] =>
  positionTypesForFen(`${placement} ${color === 'white' ? 'w' : 'b'} - - 0 1`, color);

describe('positionTypesForFen', () => {
  it('tags an isolated queen pawn (IQP) but not a generic isolani', () => {
    const t = tags('r1bqkb1r/pp3ppp/2p5/8/3P4/8/PP3PPP/R1BQKB1R');
    expect(t).toContain('IQP');
    expect(t).not.toContain('ISOLATED_PAWN');
  });

  it('tags a non-central isolated pawn as ISOLATED_PAWN, not IQP', () => {
    const t = tags('r2qk2r/ppp2ppp/8/8/P7/8/2PPP1PP/R2QK2R');
    expect(t).toContain('ISOLATED_PAWN');
    expect(t).not.toContain('IQP');
  });

  it('tags doubled pawns', () => {
    expect(tags('r2qk2r/ppp2ppp/8/8/8/2P5/PPP2PPP/R2QK2R')).toContain('DOUBLED_PAWNS');
  });

  it('tags a passed pawn for the user (and not against)', () => {
    const t = tags('3q2k1/ppp3pp/4P3/8/8/8/PP4PP/3Q2K1');
    expect(t).toContain('PASSED_PAWN_FOR');
    expect(t).not.toContain('PASSED_PAWN_AGAINST');
  });

  it('tags a passed pawn against the user (and not for)', () => {
    const t = tags('3q2k1/pp4pp/8/8/8/4p3/PP4PP/3Q2K1');
    expect(t).toContain('PASSED_PAWN_AGAINST');
    expect(t).not.toContain('PASSED_PAWN_FOR');
  });

  it('tags an open position (few pawns, open files, no locked centre)', () => {
    const t = tags('3q2k1/p6p/5p2/2p5/3P4/5P2/P6P/3Q2K1');
    expect(t).toContain('OPEN_POSITION');
    expect(t).not.toContain('CLOSED_POSITION');
  });

  it('tags a closed position (locked central pawn chains)', () => {
    const t = tags('3q2k1/pp3ppp/4p3/3pP3/3P4/8/PP3PPP/3Q2K1');
    expect(t).toContain('CLOSED_POSITION');
    expect(t).not.toContain('OPEN_POSITION');
  });

  it('tags an open file', () => {
    expect(tags('3q2k1/pppp1ppp/8/8/8/8/PPPP1PPP/3Q2K1')).toContain('OPEN_FILE');
  });

  it('tags opposite-side castling', () => {
    expect(tags('2k1r3/pp3ppp/8/8/8/8/PP3PPP/1Q4K1')).toContain('OPPOSITE_SIDE_CASTLING');
  });

  it('tags an exposed king when the shield is gone and heavy pieces remain', () => {
    const t = tags('3q2k1/pp4pp/8/8/8/8/PP6/6K1');
    expect(t).toContain('EXPOSED_KING');
  });

  it('tags a rook endgame (and queenless), not a minor or K+P endgame', () => {
    const t = tags('4r1k1/pp3ppp/8/8/8/8/PP3PPP/4R1K1');
    expect(t).toContain('ROOK_ENDGAME');
    expect(t).toContain('QUEENLESS');
    expect(t).not.toContain('MINOR_PIECE_ENDGAME');
    expect(t).not.toContain('KP_ENDGAME');
  });

  it('tags a king-and-pawn endgame', () => {
    const t = tags('6k1/pp3ppp/8/8/8/8/PP3PPP/6K1');
    expect(t).toContain('KP_ENDGAME');
    expect(t).not.toContain('ROOK_ENDGAME');
  });

  it('tags a minor-piece endgame (bishop vs knight)', () => {
    const t = tags('6k1/pp3ppp/5n2/8/8/2B5/PP3PPP/6K1');
    expect(t).toContain('MINOR_PIECE_ENDGAME');
    expect(t).not.toContain('OPP_COLORED_BISHOPS');
    expect(t).not.toContain('ROOK_ENDGAME');
  });

  it('tags opposite-colored bishops', () => {
    expect(tags('2b3k1/pp3ppp/8/8/8/8/PP3PPP/2B3K1')).toContain('OPP_COLORED_BISHOPS');
  });

  it('tags a queenless middlegame but no endgame type when pieces remain', () => {
    const t = tags('r1b2rk1/pppp1ppp/2n5/8/8/2N5/PPPP1PPP/R1B2RK1');
    expect(t).toContain('QUEENLESS');
    expect(t).not.toContain('ROOK_ENDGAME');
    expect(t).not.toContain('MINOR_PIECE_ENDGAME');
    expect(t).not.toContain('KP_ENDGAME');
  });

  it('returns no structural tags for the starting position', () => {
    expect(tags('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')).toHaveLength(0);
  });

  it('returns no tags for a malformed FEN', () => {
    expect(positionTypesForFen('not-a-fen', 'white')).toHaveLength(0);
  });
});
