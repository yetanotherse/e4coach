import type { Detector } from './types.js';
import { hangingPieceDetector } from './hangingPiece.js';
import { missedTacticDetector } from './missedTactic.js';
import { openingInaccuracyDetector } from './openingInaccuracy.js';
import { failedConversionDetector } from './failedConversion.js';
import { weakDefenseDetector } from './weakDefense.js';
import { endgameTechniqueDetector } from './endgameTechnique.js';
import { timeTroubleDetector } from './timeTrouble.js';
import { positionalDriftDetector } from './positionalDrift.js';

/** All detectors, in a stable order (spec §9.2). */
export const ALL_DETECTORS: readonly Detector[] = [
  hangingPieceDetector,
  missedTacticDetector,
  openingInaccuracyDetector,
  failedConversionDetector,
  weakDefenseDetector,
  endgameTechniqueDetector,
  timeTroubleDetector,
  positionalDriftDetector,
];

export * from './types.js';
export {
  hangingPieceDetector,
  missedTacticDetector,
  openingInaccuracyDetector,
  failedConversionDetector,
  weakDefenseDetector,
  endgameTechniqueDetector,
  timeTroubleDetector,
  positionalDriftDetector,
};
