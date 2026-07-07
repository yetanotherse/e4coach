import type { Detector, DetectorMove, GameContext } from './types.js';
import { toErrorInstance } from './types.js';
import type { ErrorInstance } from '../profile.js';

const MIN_INACCURACIES = 3;

/**
 * POSITIONAL_DRIFT — a pattern of several small inaccuracies with no single
 * blunder, i.e. the position was worsened by accumulation rather than one
 * error (spec §9.2). One instance per game, citing the worst inaccuracy.
 */
export const positionalDriftDetector: Detector = {
  category: 'POSITIONAL_DRIFT',
  detect(ctx: GameContext): ErrorInstance[] {
    const inaccuracies: DetectorMove[] = [];
    let hasBigError = false;
    for (const move of ctx.moves) {
      if (move.severity === 'inaccuracy') inaccuracies.push(move);
      if (move.severity === 'mistake' || move.severity === 'blunder') hasBigError = true;
    }
    if (hasBigError || inaccuracies.length < MIN_INACCURACIES) return [];
    const worst = inaccuracies.reduce((a, b) => (b.cpl > a.cpl ? b : a));
    return [
      toErrorInstance(
        'POSITIONAL_DRIFT',
        ctx.game,
        worst,
        `${inaccuracies.length} small inaccuracies added up with no single blunder.`,
      ),
    ];
  },
};
