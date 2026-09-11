/**
 * Training plan types (plans/phase-2.md 2.2a). A weekly plan is a draft of
 * pure data assembled deterministically from a WeaknessProfile; the LLM (if
 * used) only rephrases the per-theme goal prose around those facts.
 */
import type { WeaknessCategory } from '../taxonomy.js';

/** One position to re-solve, derived from a report example (own games, 2.2a). */
export interface DrillDraft {
  type: 'own_game';
  theme: WeaknessCategory;
  /** position BEFORE the mistake - the user's move to find */
  fen: string;
  sideToMove: 'white' | 'black';
  /** engine's better move */
  solutionUci: string;
  solutionSan?: string;
  /** what the user actually played (revealed in feedback) */
  playedMoveSan?: string;
  gameId?: string;
  /** deterministic factual note from the report (shown after solving) */
  note?: string;
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
  /** drills per theme (2.2a cap; 2.2b mixes puzzle drills in) */
  drillsPerTheme?: number;
}

/** Drill counts a goal template can reference. */
export interface GoalFacts {
  theme: WeaknessCategory;
  displayName: string;
  instanceCount: number;
  drillCount: number;
}
