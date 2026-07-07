import type { Detector, DetectorMove, GameContext } from './types.js';
import { toErrorInstance } from './types.js';
import type { ErrorInstance } from '../profile.js';
import type { ImportedGame } from '../types.js';

const WINNING_CP = 200; // +2.0 (spec §9.2)

export function userWon(game: ImportedGame): boolean {
  if (game.result === '1-0') return game.userColor === 'white';
  if (game.result === '0-1') return game.userColor === 'black';
  return false;
}

/**
 * FAILED_CONVERSION — the user reached a clearly winning position (eval ≥ +2.0)
 * but did not win the game (spec §9.2). One instance per game, citing the peak
 * position, so this reflects a game-level pattern rather than a single move.
 */
export const failedConversionDetector: Detector = {
  category: 'FAILED_CONVERSION',
  detect(ctx: GameContext): ErrorInstance[] {
    if (userWon(ctx.game) || ctx.moves.length === 0) return [];
    let peak: DetectorMove | undefined;
    for (const move of ctx.moves) {
      if (move.cpBefore >= WINNING_CP && (!peak || move.cpBefore > peak.cpBefore)) {
        peak = move;
      }
    }
    if (!peak) return [];
    const outcome = ctx.game.result === '1/2-1/2' ? 'only drew' : 'went on to lose';
    return [
      toErrorInstance('FAILED_CONVERSION',
            ctx,
        peak,
        `Reached a winning position (+${(peak.cpBefore / 100).toFixed(1)}) but ${outcome}.`,
      ),
    ];
  },
};
