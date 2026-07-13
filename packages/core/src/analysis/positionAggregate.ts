/**
 * Position-type cross-tab (spec: position-type breakdown). Computes, per
 * structural position type, how often the user's moves there were mistakes
 * versus their own overall rate — surfacing the contexts where they err
 * DISPROPORTIONATELY (lift), not merely the ones that occur most. Pure and
 * deterministic. See structure.ts for the tagging.
 */
import type { GameContext } from '../detectors/index.js';
import type { ErrorInstance, PositionTypeStat } from '../profile.js';
import { POSITION_TYPE_META, positionTypesForFen, type PositionType } from './structure.js';
import { selectExamples } from './aggregate.js';

/** Minimum sample sizes and effect size to report a type (avoid "40% off 5 moves"). */
const MIN_MOVES_IN_TYPE = 25;
const MIN_MISTAKES_IN_TYPE = 4;
const MIN_LIFT = 1.15; // must err ≥15% more than baseline to be worth flagging
const TOP_N = 5;
const MAX_EXAMPLES_PER_TYPE = 3;

/** A move counts as an error for the numerator when it's a mistake or blunder. */
function isMistake(severity: string | undefined): boolean {
  return severity === 'mistake' || severity === 'blunder';
}

/**
 * Build the ranked position-type breakdown.
 * @param contexts   all analyzed games (provides every scored move = denominator)
 * @param allInstances all detected error instances (source of example boards)
 */
export function aggregatePositionTypes(
  contexts: GameContext[],
  allInstances: ErrorInstance[],
): PositionTypeStat[] {
  const movesInType = new Map<PositionType, number>();
  const mistakesInType = new Map<PositionType, number>();
  let totalMoves = 0;
  let totalMistakes = 0;

  for (const ctx of contexts) {
    for (const move of ctx.moves) {
      totalMoves++;
      const mistake = isMistake(move.severity);
      if (mistake) totalMistakes++;
      for (const type of positionTypesForFen(move.fenBefore, ctx.game.userColor)) {
        movesInType.set(type, (movesInType.get(type) ?? 0) + 1);
        if (mistake) mistakesInType.set(type, (mistakesInType.get(type) ?? 0) + 1);
      }
    }
  }

  const baselineRate = totalMoves > 0 ? totalMistakes / totalMoves : 0;
  if (baselineRate === 0) return []; // no mistakes to attribute

  // Index error instances by the position types their position exhibits, so we
  // can show real example boards for each flagged type.
  const instancesByType = new Map<PositionType, ErrorInstance[]>();
  for (const inst of allInstances) {
    for (const type of positionTypesForFen(inst.fen, inst.userColor)) {
      const list = instancesByType.get(type);
      if (list) list.push(inst);
      else instancesByType.set(type, [inst]);
    }
  }

  const stats: PositionTypeStat[] = [];
  for (const [type, moves] of movesInType) {
    const mistakes = mistakesInType.get(type) ?? 0;
    if (moves < MIN_MOVES_IN_TYPE || mistakes < MIN_MISTAKES_IN_TYPE) continue;
    const rate = mistakes / moves;
    const lift = rate / baselineRate;
    if (lift < MIN_LIFT) continue;
    stats.push({
      type,
      label: POSITION_TYPE_META[type].label,
      movesInType: moves,
      mistakesInType: mistakes,
      rate,
      baselineRate,
      lift,
      examples: selectExamples(instancesByType.get(type) ?? [], MAX_EXAMPLES_PER_TYPE),
    });
  }

  // Rank by impact — how many mistakes AND how far above baseline — so a big,
  // clearly-worse bucket beats a marginal one.
  stats.sort((a, b) => {
    const impact = (s: PositionTypeStat) => s.mistakesInType * (s.lift - 1);
    if (impact(b) !== impact(a)) return impact(b) - impact(a);
    if (b.lift !== a.lift) return b.lift - a.lift;
    return b.movesInType - a.movesInType;
  });
  return stats.slice(0, TOP_N);
}
