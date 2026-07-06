/**
 * WeaknessProfile — the structured, engine-grounded output of the analysis
 * pipeline (spec §9.1.6–7). This is the SOURCE OF TRUTH the LLM phrases around;
 * it must never be invented by the model.
 */
import type { WeaknessCategory } from './taxonomy.js';

/** A single detected error instance, citing a real position from the user's game. */
export interface ErrorInstance {
  category: WeaknessCategory;
  gameId: string;
  gameUrl?: string;
  moveNumber: number;
  ply: number;
  fen: string; // position BEFORE the mistake — what we render
  playedMove: string;
  betterMove: string;
  cpl: number;
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
}
