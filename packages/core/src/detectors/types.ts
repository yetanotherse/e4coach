/**
 * Detector contract (spec §9.2). A detector is a PURE function over one game's
 * scored moves that returns the error instances it recognizes. Detectors never
 * do I/O and never call the engine — they read the pre-computed ScoredMoves.
 */
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

/** Helper: build an ErrorInstance from a move, filling common fields. */
export function toErrorInstance(
  category: WeaknessCategory,
  ctx: GameContext,
  move: DetectorMove,
  note: string,
): ErrorInstance {
  const ply = ctx.plies?.[move.ply];
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
    cpl: move.cpl,
    cpBefore: move.cpBefore,
    userColor: ctx.game.userColor,
    ...(ctx.plies ? { line: buildLine(ctx.plies, move.ply) } : {}),
    note,
  };
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
