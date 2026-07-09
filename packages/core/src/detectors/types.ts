/**
 * Detector contract (spec §9.2). A detector is a PURE function over one game's
 * scored moves that returns the error instances it recognizes. Detectors never
 * do I/O and never call the engine — they read the pre-computed ScoredMoves.
 */
import { Chess } from 'chess.js';
import type { ImportedGame } from '../types.js';
import type { ScoreExtras } from '../analysis/cpl.js';
import type { Ply } from '../analysis/parse.js';
import type { ScoredMove } from '../types.js';
import type { ErrorInstance, ExampleLine } from '../profile.js';
import type { WeaknessCategory } from '../taxonomy.js';

/** The unit detectors consume: a scored move plus derived board features. */
export type DetectorMove = ScoredMove & ScoreExtras;

export interface GameContext {
  game: ImportedGame;
  moves: DetectorMove[];
  /** full ply list, used to build deep links + the stepper window (optional in tests) */
  plies?: Ply[];
}

export interface Detector {
  readonly category: WeaknessCategory;
  detect(ctx: GameContext): ErrorInstance[];
}

const LINE_BEFORE = 2; // plies of context before the mistake
const LINE_AFTER = 2; // plies of context after the mistake

/**
 * Helper: build an ErrorInstance from a move. The `lead` is the detector's
 * category-specific insight; we elaborate it deterministically with the
 * position assessment, the eval swing, and the better move in SAN (spec
 * feedback #4/#5) — all grounded facts, no LLM.
 */
export function toErrorInstance(
  category: WeaknessCategory,
  ctx: GameContext,
  move: DetectorMove,
  lead: string,
): ErrorInstance {
  const ply = ctx.plies?.[move.ply];
  const betterMoveSan = uciToSan(move.fenBefore, move.bestMove);
  const assessment = assessEval(move.cpBefore);
  const note = elaborate(lead, move, assessment, betterMoveSan);
  return {
    category,
    gameId: ctx.game.id,
    gameUrl: gameUrl(ctx.game, move.ply),
    moveNumber: move.moveNumber,
    ply: move.ply,
    fen: move.fenBefore,
    playedMove: move.san,
    ...(ply?.uci ? { playedMoveUci: ply.uci } : {}),
    betterMove: move.bestMove,
    ...(betterMoveSan ? { betterMoveSan } : {}),
    cpl: move.cpl,
    cpBefore: move.cpBefore,
    cpAfter: move.cpAfter,
    assessment,
    userColor: ctx.game.userColor,
    ...(ctx.plies && ctx.plies.length > 0 ? { line: buildLine(ctx.plies, move.ply) } : {}),
    note,
  };
}

/** Convert a UCI move to SAN in the given position (returns undefined if illegal). */
function uciToSan(fen: string, uci: string): string | undefined {
  if (!uci || uci.length < 4) return undefined;
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
    });
    return move.san;
  } catch {
    return undefined;
  }
}

/** Plain-language read of a user-POV centipawn eval before the move. */
export function assessEval(cp: number): string {
  const pawns = (cp / 100).toFixed(1);
  const signed = cp > 0 ? `+${pawns}` : pawns;
  if (cp >= 300) return `winning (${signed})`;
  if (cp >= 100) return `clearly better (${signed})`;
  if (cp >= 40) return `slightly better (${signed})`;
  if (cp > -40) return `roughly equal (${signed})`;
  if (cp > -100) return `slightly worse (${signed})`;
  if (cp > -300) return `clearly worse (${signed})`;
  return `losing (${signed})`;
}

/** Build a 2–4 sentence, fact-grounded explanation around the detector's lead. */
function elaborate(
  lead: string,
  move: DetectorMove,
  assessment: string,
  betterMoveSan: string | undefined,
): string {
  const before = fmtEval(move.cpBefore);
  const after = fmtEval(move.cpAfter);
  const parts = [`Before the move you were ${assessment}.`, lead];
  if (move.cpl >= 40) {
    parts.push(`The evaluation swung from ${before} to ${after}.`);
  }
  if (betterMoveSan && betterMoveSan !== move.san) {
    parts.push(`The engine preferred ${betterMoveSan}.`);
  }
  return parts.join(' ');
}

function fmtEval(cp: number): string {
  const pawns = (cp / 100).toFixed(1);
  return cp > 0 ? `+${pawns}` : pawns;
}

/** A short board-state window around the mistake, for the stepper. */
function buildLine(plies: Ply[], mistakePly: number): ExampleLine {
  const start = Math.max(0, mistakePly - LINE_BEFORE);
  const end = Math.min(plies.length - 1, mistakePly + LINE_AFTER);
  const fens: string[] = [];
  const sans: string[] = [];
  for (let i = start; i <= end; i++) {
    fens.push(plies[i]!.fenBefore);
    sans.push(plies[i]!.san);
  }
  // Append the resulting position after the last move so the outcome is visible.
  fens.push(plies[end]!.fenAfter);
  return { fens, sans, focusIndex: mistakePly - start };
}

/** Deep-link to the exact move on Lichess, oriented to the user's side. */
function gameUrl(game: ImportedGame, ply: number): string | undefined {
  if (!/^[a-zA-Z0-9]{8}$/.test(game.id)) return undefined;
  const side = game.userColor === 'black' ? '/black' : '';
  return `https://lichess.org/${game.id}${side}#${ply + 1}`;
}
