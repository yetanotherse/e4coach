/**
 * Rendered report shape (spec §5, §9.1.8). The LLM fills the prose fields via
 * a fixed JSON schema; example positions come deterministically from the
 * WeaknessProfile. The web app renders this with Chessground boards.
 */
import type { WeaknessCategory } from './taxonomy.js';
import type { ErrorInstance } from './profile.js';

export interface ReportWeaknessSection {
  category: WeaknessCategory;
  title: string; // display name
  /** LLM prose: why this weakness costs rating (grounded in profile facts) */
  explanation: string;
  /** LLM prose: one concrete, actionable recommendation */
  recommendation: string;
  /** real positions from the user's games (never fabricated) */
  examples: ErrorInstance[];
}

/** A game embedded in the report so the in-app stepper works without auth. */
export interface EmbeddedGame {
  pgn: string; // mainline PGN
  userColor: 'white' | 'black';
  white: string;
  black: string;
  event?: string; // [Event] tag, to help the user recall the game
}

export interface ReportContent {
  headline: string; // LLM: friendly one-liner summary
  intro: string; // LLM: 1-2 sentence framing
  weaknesses: ReportWeaknessSection[]; // top 3
  confidenceNote?: string; // present when profile.lowConfidence
  /** true when produced by the template fallback (LLM unavailable) — spec §11.4 */
  degraded: boolean;
  /** games referenced by examples, keyed by gameId — for the in-app full stepper */
  games?: Record<string, EmbeddedGame>;
}
