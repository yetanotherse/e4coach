/**
 * Structural position typing (spec: position-type breakdown). Given a FEN and
 * which side the user played, derive a set of human-meaningful "position types"
 * the position exhibits (isolated pawn, open file, rook endgame, …). Pure and
 * deterministic — parses the FEN placement field directly, no engine, no PGN.
 *
 * Tags are MULTI-LABEL and may overlap (a rook endgame can also have an open
 * file). Everything is computed from the USER's perspective so labels read as
 * "your isolated pawn", "facing a passed pawn", etc.
 */
import type { Color } from '../types.js';

export type PositionType =
  | 'IQP'
  | 'ISOLATED_PAWN'
  | 'DOUBLED_PAWNS'
  | 'PASSED_PAWN_FOR'
  | 'PASSED_PAWN_AGAINST'
  | 'OPEN_POSITION'
  | 'CLOSED_POSITION'
  | 'OPEN_FILE'
  | 'OPPOSITE_SIDE_CASTLING'
  | 'EXPOSED_KING'
  | 'QUEENLESS'
  | 'ROOK_ENDGAME'
  | 'KP_ENDGAME'
  | 'MINOR_PIECE_ENDGAME'
  | 'OPP_COLORED_BISHOPS';

export interface PositionTypeMeta {
  /** Short user-facing label for the report pill. */
  label: string;
  /** One-line explanation of the structure. */
  description: string;
}

export const POSITION_TYPE_META: Record<PositionType, PositionTypeMeta> = {
  IQP: { label: "Isolated queen's pawn", description: 'You have a lone d-pawn with open lines around it.' },
  ISOLATED_PAWN: { label: 'Isolated pawn', description: 'You have a pawn with no friendly pawns on adjacent files.' },
  DOUBLED_PAWNS: { label: 'Doubled pawns', description: 'You have two pawns stacked on the same file.' },
  PASSED_PAWN_FOR: { label: 'You have a passed pawn', description: 'One of your pawns has no enemy pawns blocking its path.' },
  PASSED_PAWN_AGAINST: { label: 'Facing a passed pawn', description: 'Your opponent has a pawn with a clear run to promotion.' },
  OPEN_POSITION: { label: 'Open position', description: 'Few pawns and open lines — piece activity dominates.' },
  CLOSED_POSITION: { label: 'Closed position', description: 'Locked central pawn chains — maneuvering matters more than tactics.' },
  OPEN_FILE: { label: 'Open file', description: 'At least one file is clear of pawns for the rooks.' },
  OPPOSITE_SIDE_CASTLING: { label: 'Opposite-side castling', description: 'Kings on opposite wings — sharp, race-like play.' },
  EXPOSED_KING: { label: 'Your king exposed', description: 'Your king has little pawn cover with heavy pieces still on.' },
  QUEENLESS: { label: 'Queens off', description: 'No queens on the board — quieter, technical play.' },
  ROOK_ENDGAME: { label: 'Rook endgame', description: 'Only rooks and pawns remain.' },
  KP_ENDGAME: { label: 'King & pawn endgame', description: 'Only kings and pawns remain.' },
  MINOR_PIECE_ENDGAME: { label: 'Minor-piece endgame', description: 'Only bishops/knights and pawns remain.' },
  OPP_COLORED_BISHOPS: { label: 'Opposite-colored bishops', description: 'One bishop each, on opposite square colors.' },
};

interface Pawn {
  file: number; // 0..7 (a..h)
  rank: number; // 1..8
}

interface ParsedBoard {
  userPawns: Pawn[];
  oppPawns: Pawn[];
  /** pawn count per file, indexed [color][file]; color keyed by 'user'/'opp' */
  userByFile: number[];
  oppByFile: number[];
  totalPawns: number;
  counts: { q: number; r: number; n: number; b: number };
  userKing: { file: number; rank: number } | null;
  oppKing: { file: number; rank: number } | null;
  oppHeavy: boolean; // opponent still has a queen or rook
  whiteBishopSquares: number[]; // parity (0/1) of each white bishop's square
  blackBishopSquares: number[];
  whiteBishops: number;
  blackBishops: number;
  whiteKnights: number;
  blackKnights: number;
}

const CENTRAL_FILES = [2, 3, 4, 5]; // c, d, e, f
const D_FILE = 3;

/** Parse the FEN placement field into user/opponent-relative board facts. */
function parseBoard(fen: string, userColor: Color): ParsedBoard | null {
  const placement = fen.split(' ')[0];
  if (!placement) return null;
  const rows = placement.split('/');
  if (rows.length !== 8) return null;

  const userPawns: Pawn[] = [];
  const oppPawns: Pawn[] = [];
  const userByFile = new Array<number>(8).fill(0);
  const oppByFile = new Array<number>(8).fill(0);
  const counts = { q: 0, r: 0, n: 0, b: 0 };
  let userKing: ParsedBoard['userKing'] = null;
  let oppKing: ParsedBoard['oppKing'] = null;
  let whiteQ = 0;
  let blackQ = 0;
  let whiteR = 0;
  let blackR = 0;
  let whiteBishops = 0;
  let blackBishops = 0;
  let whiteKnights = 0;
  let blackKnights = 0;
  const whiteBishopSquares: number[] = [];
  const blackBishopSquares: number[] = [];

  for (let row = 0; row < 8; row++) {
    const rank = 8 - row;
    let file = 0;
    for (const ch of rows[row]!) {
      if (ch >= '1' && ch <= '8') {
        file += Number(ch);
        continue;
      }
      if (file > 7) return null; // malformed
      const isWhite = ch === ch.toUpperCase();
      const type = ch.toLowerCase();
      const isUser =
        (userColor === 'white' && isWhite) || (userColor === 'black' && !isWhite);
      const squareParity = (file + rank) % 2;
      switch (type) {
        case 'p':
          if (isUser) {
            userPawns.push({ file, rank });
            userByFile[file] = (userByFile[file] ?? 0) + 1;
          } else {
            oppPawns.push({ file, rank });
            oppByFile[file] = (oppByFile[file] ?? 0) + 1;
          }
          break;
        case 'q':
          counts.q++;
          if (isWhite) whiteQ++;
          else blackQ++;
          break;
        case 'r':
          counts.r++;
          if (isWhite) whiteR++;
          else blackR++;
          break;
        case 'n':
          counts.n++;
          if (isWhite) whiteKnights++;
          else blackKnights++;
          break;
        case 'b':
          counts.b++;
          if (isWhite) {
            whiteBishops++;
            whiteBishopSquares.push(squareParity);
          } else {
            blackBishops++;
            blackBishopSquares.push(squareParity);
          }
          break;
        case 'k':
          if (isUser) userKing = { file, rank };
          else oppKing = { file, rank };
          break;
        default:
          return null; // unknown piece char
      }
      file++;
    }
  }

  const oppQ = userColor === 'white' ? blackQ : whiteQ;
  const oppR = userColor === 'white' ? blackR : whiteR;

  return {
    userPawns,
    oppPawns,
    userByFile,
    oppByFile,
    totalPawns: userPawns.length + oppPawns.length,
    counts,
    userKing,
    oppKing,
    oppHeavy: oppQ + oppR > 0,
    whiteBishopSquares,
    blackBishopSquares,
    whiteBishops,
    blackBishops,
    whiteKnights,
    blackKnights,
  };
}

/** A user pawn on `file` with no friendly pawns on either adjacent file. */
function isIsolated(file: number, userByFile: number[]): boolean {
  const left = file > 0 ? userByFile[file - 1]! : 0;
  const right = file < 7 ? userByFile[file + 1]! : 0;
  return left === 0 && right === 0;
}

/** No enemy pawns on the same or adjacent files ahead of this pawn. */
function isPassed(pawn: Pawn, enemyPawns: Pawn[], forward: 1 | -1): boolean {
  return !enemyPawns.some(
    (q) =>
      Math.abs(q.file - pawn.file) <= 1 &&
      (forward === 1 ? q.rank > pawn.rank : q.rank < pawn.rank),
  );
}

/** Count of user pawns shielding the king (adjacent files, up to 2 ranks ahead). */
function shieldCount(
  king: { file: number; rank: number },
  userPawns: Pawn[],
  forward: 1 | -1,
): number {
  return userPawns.filter(
    (p) =>
      Math.abs(p.file - king.file) <= 1 &&
      (forward === 1
        ? p.rank > king.rank && p.rank <= king.rank + 2
        : p.rank < king.rank && p.rank >= king.rank - 2),
  ).length;
}

type Wing = 'q' | 'k' | 'center';
function wingOf(file: number): Wing {
  if (file <= 2) return 'q'; // a–c
  if (file >= 5) return 'k'; // f–h
  return 'center';
}

/**
 * Derive the set of position types a FEN exhibits, from the user's perspective.
 * Returns an empty array for a malformed FEN (caller simply gets no tags).
 */
export function positionTypesForFen(fen: string, userColor: Color): PositionType[] {
  const b = parseBoard(fen, userColor);
  if (!b) return [];
  const tags = new Set<PositionType>();
  const forward: 1 | -1 = userColor === 'white' ? 1 : -1;
  const enemyForward: 1 | -1 = forward === 1 ? -1 : 1;

  // ── Pawn structure ──────────────────────────────────────────────
  const isolatedFiles = new Set<number>();
  for (const p of b.userPawns) {
    if (isIsolated(p.file, b.userByFile)) isolatedFiles.add(p.file);
  }
  if (isolatedFiles.size > 0) {
    // IQP = a lone isolated d-pawn on an open-ish centre; otherwise a plain isolani.
    const dIsolatedOpen =
      isolatedFiles.has(D_FILE) && b.userByFile[D_FILE] === 1 && b.oppByFile[D_FILE] === 0;
    if (dIsolatedOpen) tags.add('IQP');
    if (!dIsolatedOpen || isolatedFiles.size > 1) tags.add('ISOLATED_PAWN');
  }
  if (b.userByFile.some((n) => n >= 2)) tags.add('DOUBLED_PAWNS');
  if (b.userPawns.some((p) => isPassed(p, b.oppPawns, forward))) tags.add('PASSED_PAWN_FOR');
  if (b.oppPawns.some((p) => isPassed(p, b.userPawns, enemyForward)))
    tags.add('PASSED_PAWN_AGAINST');

  // ── Files & centre openness ─────────────────────────────────────
  let openFiles = 0;
  for (let f = 0; f < 8; f++) {
    if (b.userByFile[f]! + b.oppByFile[f]! === 0) openFiles++;
  }
  if (openFiles >= 1) tags.add('OPEN_FILE');

  const whiteByFile = userColor === 'white' ? b.userByFile : b.oppByFile;
  const blackByFile = userColor === 'white' ? b.oppByFile : b.userByFile;
  const whitePawns = userColor === 'white' ? b.userPawns : b.oppPawns;
  const blackPawns = userColor === 'white' ? b.oppPawns : b.userPawns;
  let lockedCentre = 0;
  for (const f of CENTRAL_FILES) {
    if (whiteByFile[f]! === 0 || blackByFile[f]! === 0) continue;
    // A white pawn directly blocked by a black pawn one rank ahead = locked.
    const blocked = whitePawns.some(
      (w) => w.file === f && blackPawns.some((bl) => bl.file === f && bl.rank === w.rank + 1),
    );
    if (blocked) lockedCentre++;
  }
  if (lockedCentre >= 2) tags.add('CLOSED_POSITION');
  else if (b.totalPawns <= 12 && openFiles >= 2) tags.add('OPEN_POSITION');

  // ── King safety ─────────────────────────────────────────────────
  if (b.userKing && b.oppKing) {
    const uw = wingOf(b.userKing.file);
    const ow = wingOf(b.oppKing.file);
    if (uw !== 'center' && ow !== 'center' && uw !== ow) tags.add('OPPOSITE_SIDE_CASTLING');
    if (b.oppHeavy && shieldCount(b.userKing, b.userPawns, forward) <= 1) tags.add('EXPOSED_KING');
  }

  // ── Material regime / endgame composition ───────────────────────
  const { q, r, n, b: bishops } = b.counts;
  if (q === 0) {
    tags.add('QUEENLESS');
    if (r === 0 && n === 0 && bishops === 0) tags.add('KP_ENDGAME');
    else if (n === 0 && bishops === 0 && r >= 1) tags.add('ROOK_ENDGAME');
    else if (r === 0 && n + bishops >= 1) tags.add('MINOR_PIECE_ENDGAME');
    // Opposite-coloured bishops: exactly one bishop each, opposite square colours,
    // no knights (rooks allowed). A classic drawish/pressure marker.
    if (
      n === 0 &&
      b.whiteBishops === 1 &&
      b.blackBishops === 1 &&
      b.whiteBishopSquares[0] !== b.blackBishopSquares[0]
    ) {
      tags.add('OPP_COLORED_BISHOPS');
    }
  }

  return [...tags];
}
