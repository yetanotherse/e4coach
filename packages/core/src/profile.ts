/**
 * WeaknessProfile — the structured, engine-grounded output of the analysis
 * pipeline (spec §9.1.6–7). This is the SOURCE OF TRUTH the LLM phrases around;
 * it must never be invented by the model.
 */
import type { WeaknessCategory } from './taxonomy.js';
import type { PositionType } from './analysis/structure.js';
import type { Variation } from './analysis/explain.js';

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
  betterMoveSan?: string; // human-readable SAN of the better move
  cpl: number;
  cpBefore: number; // user-POV eval before the move (for example ranking)
  cpAfter: number; // user-POV eval after the move (for the swing)
  /** plain-language read of the position before the move, e.g. "losing (−5.2)" */
  assessment: string;
  /** which side the user played — orient the board to this (spec feedback #3) */
  userColor: 'white' | 'black';
  /** short move window around the mistake for the stepper */
  line?: ExampleLine;
  /** elaborated, factual explanation produced deterministically (not the LLM) */
  note: string;
  /**
   * Coaching explanation of WHY the engine's move was better, added by the deep
   * analysis pass. Absent on reports generated before that pass existed, and
   * whenever it is disabled — always fall back to `note`.
   */
  explanation?: MoveExplanation;
  /**
   * Engine lines the reader can step through: how the opponent punishes the
   * played move, what the engine intended, and other moves that also held.
   * Stored as start position + SAN only; UCI is re-derivable on the client.
   */
  variations?: Variation[];
}

/** Plain-language coaching prose for one mistake. */
export interface MoveExplanation {
  /** what the played move allowed the opponent to do */
  whatWentWrong: string;
  /** what the engine's move accomplishes instead */
  whyBetter: string;
  /** the transferable lesson */
  takeaway: string;
  /** `llm` when narrated by the model, `template` when deterministically rendered */
  source: 'llm' | 'template';
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

/**
 * How often the user erred in positions exhibiting a given structural type,
 * relative to their own overall mistake rate. Deterministic cross-tab computed
 * over ALL scored moves (denominator) and mistakes (numerator).
 */
export interface PositionTypeStat {
  type: PositionType;
  label: string; // user-facing label (from POSITION_TYPE_META)
  movesInType: number; // scored user moves whose position had this type
  mistakesInType: number; // of those, moves that were a mistake/blunder
  rate: number; // mistakesInType / movesInType (0..1)
  baselineRate: number; // the player's overall mistake rate (0..1)
  lift: number; // rate / baselineRate (>1 = errs here more than average)
  examples: ErrorInstance[]; // up to 3 real positions of this type
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
  /** structural contexts where the user errs disproportionately (may be empty) */
  positionTypes?: PositionTypeStat[];
  engineMeta: { kind: string; version?: string; depth?: number; movetimeMs?: number };
  /** what was actually analyzed — surfaced to the user (spec feedback #6) */
  scope?: AnalysisScope;
}

export interface AnalysisScope {
  requestedMax: number;
  gamesFetched: number;
  gamesAnalyzed: number;
  skipped: number;
  perfTypes: string[]; // what the user requested
  gameTypes: string[]; // the actual speeds present in the analyzed games
  timeControls: string[];
  dateFrom?: string; // ISO date of earliest game
  dateTo?: string; // ISO date of latest game
}
