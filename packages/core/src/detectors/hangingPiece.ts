import type { Detector, GameContext } from './types.js';
import { toErrorInstance } from './types.js';
import type { ErrorInstance } from '../profile.js';

/**
 * HANGING_PIECE — the user made a move after which the opponent won a minor
 * piece or more that the user could not recapture (spec §9.2). Driven by the
 * engine-independent material-loss signal from parsing, gated by a real
 * evaluation swing so we don't flag deliberate sacrifices that kept the eval.
 */
export const hangingPieceDetector: Detector = {
  category: 'HANGING_PIECE',
  detect(ctx: GameContext): ErrorInstance[] {
    const out: ErrorInstance[] = [];
    for (const move of ctx.moves) {
      if (move.decided) continue; // already winning/losing — not instructive
      const lost = move.userMaterialLossNextPly;
      if (lost >= 3 && (move.severity === 'blunder' || move.severity === 'mistake')) {
        out.push(
          toErrorInstance('HANGING_PIECE',
            ctx,
            move,
            `You left a piece hanging — about ${lost} points of material dropped for nothing.`,
          ),
        );
      }
    }
    return out;
  },
};
