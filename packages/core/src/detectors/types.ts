/**
 * Detector contract (spec §9.2). A detector is a PURE function over one game's
 * scored moves that returns the error instances it recognizes. Detectors never
 * do I/O and never call the engine — they read the pre-computed ScoredMoves.
 */
import type { ImportedGame } from '../types.js';
import type { ScoreExtras } from '../analysis/cpl.js';
import type { ScoredMove } from '../types.js';
import type { ErrorInstance } from '../profile.js';
import type { WeaknessCategory } from '../taxonomy.js';

/** The unit detectors consume: a scored move plus derived board features. */
export type DetectorMove = ScoredMove & ScoreExtras;

export interface GameContext {
  game: ImportedGame;
  moves: DetectorMove[];
}

export interface Detector {
  readonly category: WeaknessCategory;
  detect(ctx: GameContext): ErrorInstance[];
}

/** Helper: build an ErrorInstance from a move, filling common fields. */
export function toErrorInstance(
  category: WeaknessCategory,
  game: ImportedGame,
  move: DetectorMove,
  note: string,
): ErrorInstance {
  return {
    category,
    gameId: game.id,
    gameUrl: gameUrl(game),
    moveNumber: move.moveNumber,
    ply: move.ply,
    fen: move.fenBefore,
    playedMove: move.san,
    betterMove: move.bestMove,
    cpl: move.cpl,
    note,
  };
}

function gameUrl(game: ImportedGame): string | undefined {
  // Lichess game ids are 8 chars; construct a canonical URL when plausible.
  if (/^[a-zA-Z0-9]{8}$/.test(game.id)) return `https://lichess.org/${game.id}`;
  return undefined;
}
