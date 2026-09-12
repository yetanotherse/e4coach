import { describe, it, expect } from 'vitest';
import { lichessPuzzleFrom } from './puzzlePositions.js';

// Position after 1.e4 (white has just moved — the "opponent" in Lichess terms).
const BEFORE_SETUP = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
// The full Lichess-style line: opponent's e7e5, then the solver's line.
const LINE = 'e7e5 g1f3 b8c6 f1b5';

describe('lichessPuzzleFrom', () => {
  it('applies the opponent setup move and flips the side to move', () => {
    const pz = lichessPuzzleFrom(BEFORE_SETUP, LINE);
    expect(pz).not.toBeNull();
    expect(pz!.fen).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    // Solver is the opposite color of the raw FEN's turn field (b → white).
    expect(pz!.sideToMove).toBe('white');
  });

  it('drops the setup move from the solution line and keeps the rest', () => {
    const pz = lichessPuzzleFrom(BEFORE_SETUP, LINE);
    expect(pz!.setupMoveUci).toBe('e7e5');
    expect(pz!.solutionUci).toBe('g1f3');
    expect(pz!.solutionLine).toBe('g1f3 b8c6 f1b5');
  });

  it('handles a black-to-move solver', () => {
    // After 1.e4 e5 2.Nf3 the opponent (white) plays Bb5+? No — build the
    // mirror: white to move is the opponent, solver is black.
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const pz = lichessPuzzleFrom(fen, 'f1c4 g8f6 e1g1');
    expect(pz!.sideToMove).toBe('black');
    expect(pz!.solutionUci).toBe('g8f6');
    expect(pz!.solutionLine).toBe('g8f6 e1g1');
  });

  it('supports promotion notation in the setup and line', () => {
    const fen = '8/P6k/8/8/8/8/7K/8 w - - 0 1';
    const pz = lichessPuzzleFrom(fen, 'a7a8q g7g8');
    expect(pz!.fen.split(' ')[0]).toContain('Q');
    expect(pz!.solutionUci).toBe('g7g8');
  });

  it('returns null for malformed input', () => {
    expect(lichessPuzzleFrom(BEFORE_SETUP, 'e7e5')).toBeNull(); // setup only
    expect(lichessPuzzleFrom(BEFORE_SETUP, '')).toBeNull();
    expect(lichessPuzzleFrom('not a fen', 'e7e5 g1f3')).toBeNull();
    expect(lichessPuzzleFrom(BEFORE_SETUP, 'a2a4 g1f3')).toBeNull(); // illegal setup (black to move)
  });
});
