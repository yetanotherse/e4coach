/**
 * Lichess puzzle theme mapping (plans/phase-2.md 2.2b). The puzzle DB tags
 * each puzzle with themes; we ingest only puzzles whose themes map to a
 * weakness category, so puzzle drills train the same taxonomy as own-game
 * drills. Conservative: a theme is assigned exactly one category, and themes
 * with no clear mapping are ignored.
 */
import type { WeaknessCategory } from '../taxonomy.js';

export const PUZZLE_THEME_TO_CATEGORY: Record<string, WeaknessCategory> = {
  // Material-blunder patterns
  hangingPiece: 'HANGING_PIECE',
  trappedPiece: 'HANGING_PIECE',

  // Tactical motifs (the patterns the MISSED_TACTIC detector looks for)
  fork: 'MISSED_TACTIC',
  pin: 'MISSED_TACTIC',
  skewer: 'MISSED_TACTIC',
  discoveredAttack: 'MISSED_TACTIC',
  doubleCheck: 'MISSED_TACTIC',
  sacrifice: 'MISSED_TACTIC',
  deflection: 'MISSED_TACTIC',
  decoy: 'MISSED_TACTIC',
  interception: 'MISSED_TACTIC',
  clearance: 'MISSED_TACTIC',
  attraction: 'MISSED_TACTIC',
  xRayAttack: 'MISSED_TACTIC',
  zwischenzug: 'MISSED_TACTIC',

  // Conversion / pressing an advantage
  crushing: 'FAILED_CONVERSION',
  advantage: 'FAILED_CONVERSION',
  kingsideAttack: 'FAILED_CONVERSION',
  attackingF2F7: 'FAILED_CONVERSION',

  // Holding tough positions
  defensiveMove: 'WEAK_DEFENSE',

  // Simplified-position technique
  endgame: 'ENDGAME_TECHNIQUE',
  rookEndgame: 'ENDGAME_TECHNIQUE',
  pawnEndgame: 'ENDGAME_TECHNIQUE',
  queenRookEndgame: 'ENDGAME_TECHNIQUE',

  // Positional play
  quietMove: 'POSITIONAL_DRIFT',
  improvement: 'POSITIONAL_DRIFT',
  long: 'POSITIONAL_DRIFT',

  // Openings
  opening: 'OPENING_INACCURACY',
};

/** Categories we can train with puzzles (TIME_TROUBLE is play-skill, not a puzzle). */
export const PUZZLE_TRAINABLE_CATEGORIES = [
  'HANGING_PIECE',
  'MISSED_TACTIC',
  'FAILED_CONVERSION',
  'WEAK_DEFENSE',
  'ENDGAME_TECHNIQUE',
  'POSITIONAL_DRIFT',
  'OPENING_INACCURACY',
] as const satisfies readonly WeaknessCategory[];

/** Parse the DB's "Themes" column (space-separated tags). */
export function themesFromTagString(tags: string): string[] {
  return tags.split(' ').filter(Boolean);
}

/** The weakness category this puzzle trains, or null when out of scope. */
export function categoryForThemes(tags: string[]): WeaknessCategory | null {
  for (const tag of tags) {
    const category = PUZZLE_THEME_TO_CATEGORY[tag];
    if (category) return category;
  }
  return null;
}
