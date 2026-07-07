/**
 * Core domain types shared across app + worker.
 * Pure data — no I/O, no vendor types. See spec §8, §9.
 */

/** Which side the imported user played. */
export type Color = 'white' | 'black';

/** A single engine evaluation of a position. */
export interface EngineEval {
  /** centipawns from the side-to-move perspective (positive = better for mover) */
  cp?: number;
  /** mate-in-N (positive = mover mates) */
  mate?: number;
  bestMove: string;
  pv: string[];
  depth: number;
}

/** A game imported from a GameSource (spec §8.3). */
export interface ImportedGame {
  id: string;
  pgn: string;
  white: string;
  black: string;
  userColor: Color;
  result: string; // '1-0' | '0-1' | '1/2-1/2'
  timeControl: string;
  eco?: string;
  opening?: string;
  clocks?: number[]; // centiseconds remaining per ply, if provided
  evals?: EngineEval[]; // source-provided evals per ply, if present
  playedAt: string; // ISO
}

/** Severity of a single move error, aligned with Lichess conventions (spec §9.1.4). */
export type MoveSeverity = 'inaccuracy' | 'mistake' | 'blunder';

/**
 * A scored user move: the engine's view before/after the played move,
 * plus derived centipawn loss. This is the atomic unit detectors consume.
 */
export interface ScoredMove {
  gameId: string;
  ply: number; // 0-indexed half-move within the game
  moveNumber: number; // 1-indexed full move number
  san: string; // the move actually played
  fenBefore: string;
  fenAfter: string;
  /** centipawns from the USER's perspective before the move */
  cpBefore: number;
  /** centipawns from the USER's perspective after the move */
  cpAfter: number;
  /** clamped, win-probability-aware centipawn loss (>= 0) */
  cpl: number;
  bestMove: string;
  severity?: MoveSeverity;
  clockRemaining?: number; // centiseconds after the move, if known
  phase: GamePhase;
  isCapture: boolean;
  isCheck: boolean;
}

export type GamePhase = 'opening' | 'middlegame' | 'endgame';
