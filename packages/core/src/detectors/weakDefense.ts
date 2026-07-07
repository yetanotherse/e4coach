import type { Detector, GameContext } from './types.js';
import { toErrorInstance } from './types.js';
import type { ErrorInstance } from '../profile.js';

const LOSING_CP = -200; // -2.0 (spec §9.2)

/**
 * WEAK_DEFENSE — when already worse (eval ≤ -2.0 before the move), the user
 * made a further significant error and let the position collapse instead of
 * holding (spec §9.2). Cites the collapse move.
 */
export const weakDefenseDetector: Detector = {
  category: 'WEAK_DEFENSE',
  detect(ctx: GameContext): ErrorInstance[] {
    const out: ErrorInstance[] = [];
    for (const move of ctx.moves) {
      const alreadyWorse = move.cpBefore <= LOSING_CP;
      const collapsed = move.severity === 'blunder' || move.severity === 'mistake';
      if (alreadyWorse && collapsed) {
        out.push(
          toErrorInstance(
            'WEAK_DEFENSE',
            ctx.game,
            move,
            `Under pressure (${(move.cpBefore / 100).toFixed(1)}), ${move.san} let it collapse further; ${move.bestMove} held tougher.`,
          ),
        );
      }
    }
    return out;
  },
};
