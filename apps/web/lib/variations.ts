/**
 * Expand a stored variation (start position + SAN) into the per-ply positions
 * the board stepper needs.
 *
 * Variations are persisted as `startFen` + `sans` rather than a list of FENs —
 * a FEN is ~70 bytes and the report JSONB is already large, so the client
 * re-derives them instead. Pure and dependency-light on purpose: it lives here
 * rather than inside the component so it can be unit-tested in the repo's
 * existing node test environment (there is no jsdom/RTL setup).
 */
import { Chess } from 'chess.js';

export interface ExpandedVariation {
  /** position before each ply, plus the final position — length is sans.length + 1 */
  fens: string[];
  /** the SAN actually applied (may be shorter than the input if a move failed) */
  sans: string[];
  /** UCI of each applied ply, for drawing arrows */
  ucis: string[];
}

/**
 * Replay SAN from a position. Truncates at the first move that does not apply
 * rather than throwing, so a malformed or stale stored line degrades to the
 * prefix that worked instead of blanking the board.
 */
export function expandVariation(startFen: string, sans: string[]): ExpandedVariation {
  let chess: Chess;
  try {
    chess = new Chess(startFen);
  } catch {
    return { fens: [startFen], sans: [], ucis: [] };
  }

  const fens: string[] = [chess.fen()];
  const applied: string[] = [];
  const ucis: string[] = [];

  for (const san of sans) {
    try {
      const move = chess.move(san);
      applied.push(move.san);
      ucis.push(`${move.from}${move.to}${move.promotion ?? ''}`);
      fens.push(chess.fen());
    } catch {
      break;
    }
  }

  return { fens, sans: applied, ucis };
}
