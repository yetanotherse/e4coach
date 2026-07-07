/**
 * PGN parsing (spec §9.1.2). Replays a game with chess.js and produces a
 * per-ply structure with board features the detectors need — all derived
 * purely from the moves, no engine required. Pure function, no I/O.
 */
import { Chess } from 'chess.js';
import type { Color, GamePhase, ImportedGame } from '../types.js';

/** Standard piece values (pawns) for material accounting. */
const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export interface Ply {
  index: number; // 0-based half-move index
  moveNumber: number; // 1-based full move number
  color: Color;
  /** true when this ply was played by the imported user */
  userMove: boolean;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  isCapture: boolean;
  isCheck: boolean;
  /** value of the piece captured on this ply (0 if none) */
  capturedValue: number;
  /** total non-king pieces on the board after this ply */
  pieceCount: number;
  phase: GamePhase;
  /**
   * Net material (in pawns) the user LOSES as a direct consequence of a user
   * move: the opponent's immediate reply captures a user piece that the user
   * cannot recapture on the very next ply. Only set on user moves. Heuristic
   * but deterministic — the primary signal for HANGING_PIECE.
   */
  userMaterialLossNextPly?: number;
}

export interface ParsedGame {
  game: ImportedGame;
  plies: Ply[];
}

function pieceCountFromFen(fen: string): number {
  const board = fen.split(' ')[0] ?? '';
  let count = 0;
  for (const ch of board) {
    if (/[pnbrqPNBRQ]/.test(ch)) count++;
  }
  return count;
}

function phaseFor(moveNumber: number, pieceCountAfter: number): GamePhase {
  if (pieceCountAfter <= 10) return 'endgame'; // ~7 pieces + a few pawns (spec §9.2)
  if (moveNumber <= 10) return 'opening';
  return 'middlegame';
}

/**
 * Replays the PGN. Throws on illegal/unparseable PGN so the pipeline can
 * isolate a single bad game (spec §11.4) instead of corrupting the batch.
 */
export function parseGame(game: ImportedGame): ParsedGame {
  const chess = new Chess();
  chess.loadPgn(game.pgn); // throws on malformed PGN
  const history = chess.history({ verbose: true });

  const userLetter = game.userColor === 'white' ? 'w' : 'b';

  const plies: Ply[] = history.map((m, index) => {
    const color: Color = m.color === 'w' ? 'white' : 'black';
    const pieceCount = pieceCountFromFen(m.after);
    const moveNumber = Math.floor(index / 2) + 1;
    return {
      index,
      moveNumber,
      color,
      userMove: m.color === userLetter,
      san: m.san,
      uci: m.lan,
      fenBefore: m.before,
      fenAfter: m.after,
      isCapture: m.flags.includes('c') || m.flags.includes('e'),
      isCheck: m.san.includes('+') || m.san.includes('#'),
      capturedValue: m.captured ? (PIECE_VALUE[m.captured] ?? 0) : 0,
      pieceCount,
      phase: phaseFor(moveNumber, pieceCount),
    };
  });

  // Second pass: compute user material loss on the immediately following ply,
  // net of any recapture the user makes on the ply after that.
  for (let i = 0; i < plies.length; i++) {
    const ply = plies[i]!;
    if (!ply.userMove) continue;
    const opponentReply = plies[i + 1];
    if (!opponentReply || !opponentReply.isCapture) {
      ply.userMaterialLossNextPly = 0;
      continue;
    }
    const lost = opponentReply.capturedValue;
    const userRecapture = plies[i + 2];
    const regained =
      userRecapture && userRecapture.userMove && userRecapture.isCapture
        ? userRecapture.capturedValue
        : 0;
    ply.userMaterialLossNextPly = Math.max(0, lost - regained);
  }

  return { game, plies };
}

export { PIECE_VALUE };
