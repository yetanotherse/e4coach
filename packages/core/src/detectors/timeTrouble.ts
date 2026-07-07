import type { Detector, GameContext } from './types.js';
import { toErrorInstance } from './types.js';
import type { ErrorInstance } from '../profile.js';

/** Below ~15s remaining (clocks are in centiseconds). */
const LOW_CLOCK_CS = 1500;

/**
 * TIME_TROUBLE — significant errors correlated with a low remaining clock
 * (spec §9.2). Requires clock data; silently contributes nothing when absent.
 */
export const timeTroubleDetector: Detector = {
  category: 'TIME_TROUBLE',
  detect(ctx: GameContext): ErrorInstance[] {
    const out: ErrorInstance[] = [];
    for (const move of ctx.moves) {
      const clock = move.clockRemaining;
      if (
        clock !== undefined &&
        clock <= LOW_CLOCK_CS &&
        (move.severity === 'blunder' || move.severity === 'mistake')
      ) {
        out.push(
          toErrorInstance('TIME_TROUBLE',
            ctx,
            move,
            `${move.severity} on move ${move.moveNumber} with only ${(clock / 100).toFixed(0)}s left.`,
          ),
        );
      }
    }
    return out;
  },
};
