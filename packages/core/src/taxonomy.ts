/**
 * Weakness taxonomy (spec §9.2). Each category has a stable id, a display
 * name, and a plain-language description template that the LLM will phrase
 * around — never inventing facts beyond what the detector computed.
 */

export const WEAKNESS_CATEGORIES = [
  'HANGING_PIECE',
  'MISSED_TACTIC',
  'OPENING_INACCURACY',
  'FAILED_CONVERSION',
  'WEAK_DEFENSE',
  'ENDGAME_TECHNIQUE',
  'TIME_TROUBLE',
  'POSITIONAL_DRIFT',
] as const;

export type WeaknessCategory = (typeof WEAKNESS_CATEGORIES)[number];

export interface CategoryMeta {
  id: WeaknessCategory;
  displayName: string;
  /** plain-language template; {n} etc. filled deterministically before render */
  description: string;
}

export const CATEGORY_META: Record<WeaknessCategory, CategoryMeta> = {
  HANGING_PIECE: {
    id: 'HANGING_PIECE',
    displayName: 'Hanging pieces',
    description:
      'You left pieces undefended and lost material to a simple capture. Double-checking what your opponent can take before you move will save the most rating.',
  },
  MISSED_TACTIC: {
    id: 'MISSED_TACTIC',
    displayName: 'Missed tactics',
    description:
      'You had a forcing tactic available — a fork, pin, or winning capture — and played a quiet move instead.',
  },
  OPENING_INACCURACY: {
    id: 'OPENING_INACCURACY',
    displayName: 'Opening inaccuracies',
    description:
      'You drifted from sound opening play early, conceding an edge before the middlegame began.',
  },
  FAILED_CONVERSION: {
    id: 'FAILED_CONVERSION',
    displayName: 'Failing to convert winning positions',
    description:
      'You reached clearly winning positions but did not bring them home. Converting is a learnable technique.',
  },
  WEAK_DEFENSE: {
    id: 'WEAK_DEFENSE',
    displayName: 'Defending under pressure',
    description:
      'When worse, your positions collapsed further rather than holding. Tougher defense turns losses into draws.',
  },
  ENDGAME_TECHNIQUE: {
    id: 'ENDGAME_TECHNIQUE',
    displayName: 'Endgame technique',
    description:
      'Errors clustered in simplified positions with few pieces, where precise technique matters most.',
  },
  TIME_TROUBLE: {
    id: 'TIME_TROUBLE',
    displayName: 'Time management',
    description:
      'Your biggest mistakes correlated with low remaining clock. Better time budgeting would prevent them.',
  },
  POSITIONAL_DRIFT: {
    id: 'POSITIONAL_DRIFT',
    displayName: 'Positional drift',
    description:
      'A pattern of small, repeated inaccuracies gradually worsened your positions without a single obvious blunder.',
  },
};
