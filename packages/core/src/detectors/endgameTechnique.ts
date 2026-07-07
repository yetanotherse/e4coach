import type { Detector, GameContext } from './types.js';
import { toErrorInstance } from './types.js';
import type { ErrorInstance } from '../profile.js';

/**
 * ENDGAME_TECHNIQUE — errors in simplified positions (few pieces on the board),
 * where precise technique matters most (spec §9.2). `phase === 'endgame'` is set
 * during parsing from the piece count.
 */
export const endgameTechniqueDetector: Detector = {
  category: 'ENDGAME_TECHNIQUE',
  detect(ctx: GameContext): ErrorInstance[] {
    const out: ErrorInstance[] = [];
    for (const move of ctx.moves) {
      if (
        move.phase === 'endgame' &&
        (move.severity === 'blunder' || move.severity === 'mistake')
      ) {
        out.push(
          toErrorInstance(
            'ENDGAME_TECHNIQUE',
            ctx.game,
            move,
            `Endgame ${move.severity} on move ${move.moveNumber} (${move.san}); ${move.bestMove} was the technique.`,
          ),
        );
      }
    }
    return out;
  },
};
