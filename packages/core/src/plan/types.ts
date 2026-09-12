/**
 * Training plan types (plans/phase-2.md 2.2a). A weekly plan is a draft of
 * pure data assembled deterministically from a WeaknessProfile; the LLM (if
 * used) only rephrases the per-theme goal prose around those facts.
 */
import type { WeaknessCategory } from '../taxonomy.js';

/** One position to re-solve: from the user's own games, or from the Lichess puzzle DB. */
export interface DrillDraft {
  type: 'own_game' | 'puzzle';
  theme: WeaknessCategory;
  /** position BEFORE the mistake — or the puzzle's start position (already post-opponent-setup) */
  fen: string;
  sideToMove: 'white' | 'black';
  /** engine's better move — or the puzzle's first solution move (UCI) */
  solutionUci: string;
  /**
   * Full solution line for multi-move puzzles (UCI, space-separated): the
   * solver's moves alternating with the opponent's replies. Single-move
   * drills (own_game) leave this unset.
   */
  solutionLine?: string;
  solutionSan?: string;
  /** what the user actually played (own_game only; puzzle drills have none) */
  playedMoveSan?: string;
  gameId?: string;
  /** deterministic factual note from the report (own_game only) */
  note?: string;
  /** Lichess puzzle id (puzzle drills only) */
  puzzleId?: string;
}

/** One focus theme of a weekly plan, with its coach-voiced goal. */
export interface PlanItemDraft {
  theme: WeaknessCategory;
  goal: string;
  drills: DrillDraft[];
}

export interface PlanDraft {
  /** Monday 00:00 UTC of this plan's week */
  weekStart: Date;
  items: PlanItemDraft[];
}

export interface PlanOptions {
  now?: Date;
  /** how many weakness themes to focus on (default 2) */
  maxThemes?: number;
  /** own-game drills per theme (2.2a cap) */
  drillsPerTheme?: number;
  /**
   * Puzzle candidates by theme (2.2b); up to `puzzlesPerTheme` are appended
   * after the theme's own-game drills.
   */
  puzzlesByTheme?: Partial<Record<string, PuzzleCandidate[]>>;
  /** puzzle drills per theme (default 2) */
  puzzlesPerTheme?: number;
}

/** Drill counts a goal template can reference. */
export interface GoalFacts {
  theme: WeaknessCategory;
  displayName: string;
  instanceCount: number;
  drillCount: number;
}

/**
 * A thematic master/puzzle position (Lichess puzzle DB slice, 2.2b), fetched
 * by the worker and handed to the assembler as pure data.
 */
export interface PuzzleCandidate {
  externalId: string;
  /** Position the solver faces — already AFTER the opponent's setup move. */
  fen: string;
  /** first move of the solver's solution line (UCI) */
  solutionUci: string;
  /** full solver line (UCI, space-separated, alternating with opponent replies) */
  solutionLine: string;
  solutionSan?: string;
  rating: number;
}
