/**
 * Lichess puzzle DB convention (plans/phase-2.md 2.2b). In the puzzle CSV the
 * FEN is the position ONE MOVE BEFORE the puzzle starts and the first move in
 * the space-separated UCI `Moves` column is the opponent's setup move; the
 * puzzle proper begins after it, with the solver holding the opposite color.
 * These helpers turn that raw (fen, line) pair into the position the solver
 * actually faces.
 */
import { Chess } from 'chess.js';

/** A puzzle position ready to be drilled: the solver's view. */
export interface LichessPuzzle {
  /** Position AFTER the opponent's setup move — what the solver faces. */
  fen: string;
  /** The solver's color (the side to move in `fen`). */
  sideToMove: 'white' | 'black';
  /** The opponent's setup move (UCI) that produced `fen`. */
  setupMoveUci: string;
  /** First move the solver must find (UCI). */
  solutionUci: string;
  /**
   * Full solution line from the solver's side: their moves alternate with the
   * opponent's replies, e.g. "g1f3 b8c6 f1b5" (UCI, space-separated).
   */
  solutionLine: string;
}

function turnOf(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

/**
 * Interpret a raw Lichess puzzle row. Returns null when the input is
 * malformed: fewer than two moves (a setup move plus at least one solver
 * move), an illegal setup move, or an unusable FEN.
 */
export function lichessPuzzleFrom(fen: string, line: string): LichessPuzzle | null {
  const moves = line.trim().split(/\s+/).filter(Boolean);
  if (moves.length < 2) return null;
  const [setupMoveUci, solutionUci] = moves as [string, string];
  try {
    const chess = new Chess(fen);
    const setup = chess.move({
      from: setupMoveUci.slice(0, 2),
      to: setupMoveUci.slice(2, 4),
      ...(setupMoveUci.length >= 5 ? { promotion: setupMoveUci[4] } : {}),
    });
    if (!setup) return null;
    return {
      fen: chess.fen(),
      sideToMove: turnOf(chess.fen()),
      setupMoveUci,
      solutionUci,
      solutionLine: moves.slice(1).join(' '),
    };
  } catch {
    return null;
  }
}
