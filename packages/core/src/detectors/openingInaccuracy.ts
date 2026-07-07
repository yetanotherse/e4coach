import type { Detector, GameContext } from './types.js';
import { toErrorInstance } from './types.js';
import type { ErrorInstance } from '../profile.js';

const OPENING_LAST_MOVE = 10; // within first ~10 full moves (spec §9.2)

/**
 * OPENING_INACCURACY — a meaningful error within the first ~10 moves, before
 * the middlegame. Any severity counts here since small early errors compound.
 */
export const openingInaccuracyDetector: Detector = {
  category: 'OPENING_INACCURACY',
  detect(ctx: GameContext): ErrorInstance[] {
    const out: ErrorInstance[] = [];
    for (const move of ctx.moves) {
      if (!move.decided && move.moveNumber <= OPENING_LAST_MOVE && move.severity) {
        out.push(
          toErrorInstance('OPENING_INACCURACY',
            ctx,
            move,
            `Early ${move.severity} on move ${move.moveNumber} (${move.san}); ${move.bestMove} was stronger.`,
          ),
        );
      }
    }
    return out;
  },
};
