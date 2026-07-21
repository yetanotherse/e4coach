/**
 * Core domain types shared across app + worker.
 * Pure data — no I/O, no vendor types. See spec §8, §9.
 */

/** Which side the imported user played. */
export type Color = 'white' | 'black';

/**
 * One principal variation from a MultiPV search. Rank 1 is the engine's best
 * move; higher ranks are progressively worse alternatives.
 */
export interface EngineLine {
  /** 1-based UCI multipv index */
  rank: number;
  /** centipawns from the side-to-move perspective */
  cp?: number;
  /** mate-in-N (positive = mover mates) */
  mate?: number;
  /** the variation in UCI, best move first */
  pv: string[];
  depth: number;
}

/** A single engine evaluation of a position. */
export interface EngineEval {
  /** centipawns from the side-to-move perspective (positive = better for mover) */
  cp?: number;
  /** mate-in-N (positive = mover mates) */
  mate?: number;
  bestMove: string;
  pv: string[];
  depth: number;
  /**
   * Top-N variations, present only when evaluated with multiPv > 1. The engine
   * may return FEWER than requested when the position has fewer legal moves —
   * never assume a length.
   */
  lines?: EngineLine[];
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
  speed?: string; // bullet | blitz | rapid | classical | correspondence
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
  uci: string; // the played move in UCI (same notation as bestMove)
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
