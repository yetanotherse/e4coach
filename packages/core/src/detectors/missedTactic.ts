import type { Detector, GameContext } from './types.js';
import { toErrorInstance } from './types.js';
import type { ErrorInstance } from '../profile.js';

/**
 * MISSED_TACTIC — a large evaluation swing where the engine's best move was a
 * forcing shot (capture/check) that the user did not play (spec §9.2). We
 * exclude cases already attributed to hanging material to avoid double-counting.
 */
export const missedTacticDetector: Detector = {
  category: 'MISSED_TACTIC',
  detect(ctx: GameContext): ErrorInstance[] {
    const out: ErrorInstance[] = [];
    for (const move of ctx.moves) {
      const bigSwing = move.severity === 'blunder' || move.severity === 'mistake';
      const droppedMaterial = move.userMaterialLossNextPly >= 3;
      if (bigSwing && move.bestMoveForcing && !droppedMaterial && move.san !== move.bestMove) {
        out.push(
          toErrorInstance(
            'MISSED_TACTIC',
            ctx.game,
            move,
            `Missed a forcing tactic (${move.bestMove}); played ${move.san} instead.`,
          ),
        );
      }
    }
    return out;
  },
};
