import type { Detector, GameContext } from './types.js';
import { toErrorInstance } from './types.js';
import type { ErrorInstance } from '../profile.js';

// Holdable-but-worse band: the position was defensible (not yet lost) before
// the move, then collapsed to clearly lost. Flagging dead-lost positions
// (< HOLDABLE_FLOOR) isn't instructive, so we bound the band from below.
const HOLDABLE_CEIL = -150; // already worse than this
const HOLDABLE_FLOOR = -600; // but still defensible (not dead lost)
const COLLAPSED_TO = -400; // and it dropped to clearly lost

/**
 * WEAK_DEFENSE — from a holdable-but-worse position the user made a further
 * significant error and let it collapse to lost, instead of putting up tougher
 * resistance (spec §9.2). Cites the collapse move.
 */
export const weakDefenseDetector: Detector = {
  category: 'WEAK_DEFENSE',
  detect(ctx: GameContext): ErrorInstance[] {
    const out: ErrorInstance[] = [];
    for (const move of ctx.moves) {
      const holdableButWorse = move.cpBefore <= HOLDABLE_CEIL && move.cpBefore >= HOLDABLE_FLOOR;
      const collapsed =
        (move.severity === 'blunder' || move.severity === 'mistake') && move.cpAfter <= COLLAPSED_TO;
      if (holdableButWorse && collapsed) {
        out.push(
          toErrorInstance('WEAK_DEFENSE',
            ctx,
            move,
            `Under pressure (${(move.cpBefore / 100).toFixed(1)}), ${move.san} let it collapse further; ${move.bestMove} held tougher.`,
          ),
        );
      }
    }
    return out;
  },
};
