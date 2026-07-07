/**
 * WeaknessProfile — the structured, engine-grounded output of the analysis
 * pipeline (spec §9.1.6–7). This is the SOURCE OF TRUTH the LLM phrases around;
 * it must never be invented by the model.
 */
import type { WeaknessCategory } from './taxonomy.js';

/** A short move window around the mistake, for the interactive stepper. */
export interface ExampleLine {
  fens: string[]; // FEN before each ply in the window
  sans: string[]; // SAN of each ply in the window
  focusIndex: number; // index of the mistake ply within the window
}

/** A single detected error instance, citing a real position from the user's game. */
export interface ErrorInstance {
  category: WeaknessCategory;
  gameId: string;
  gameUrl?: string;
  moveNumber: number;
  ply: number;
  fen: string; // position BEFORE the mistake — what we render
  playedMove: string; // SAN of the move the user played
  playedMoveUci?: string; // UCI of the played move (for a red arrow)
  betterMove: string; // UCI of the engine's better move (for a green arrow)
  cpl: number;
  cpBefore: number; // user-POV eval before the move (for example ranking)
  /** which side the user played — orient the board to this (spec feedback #3) */
  userColor: 'white' | 'black';
  /** short move window around the mistake for the stepper */
  line?: ExampleLine;
  /** short, factual note produced by the detector (not the LLM) */
  note: string;
}

/** Aggregated stats for one weakness category. */
export interface WeaknessCategoryStat {
  category: WeaknessCategory;
  frequency: number; // count of instances
  /** heuristic estimate of rating points lost to this category */
  estimatedRatingLoss: number;
  /** up to 3 representative example positions from the user's own games */
  examples: ErrorInstance[];
}

export interface WeaknessProfile {
  username: string;
  source: string; // 'lichess' | ...
  gamesAnalyzed: number;
  movesScored: number;
  /** true when sample is small (< ~10 games) — surfaced as a confidence caveat */
  lowConfidence: boolean;
  /** all categories with at least one instance, unranked */
  categories: WeaknessCategoryStat[];
  /** top 3 by estimatedRatingLoss (spec §9.1.7) */
  topWeaknesses: WeaknessCategory[];
  engineMeta: { kind: string; version?: string; depth?: number; movetimeMs?: number };
  /** what was actually analyzed — surfaced to the user (spec feedback #6) */
  scope?: AnalysisScope;
}

export interface AnalysisScope {
  requestedMax: number;
  gamesFetched: number;
  gamesAnalyzed: number;
  skipped: number;
  perfTypes: string[];
  timeControls: string[];
  dateFrom?: string; // ISO date of earliest game
  dateTo?: string; // ISO date of latest game
}
