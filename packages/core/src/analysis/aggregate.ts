/**
 * Aggregate detector output into a ranked WeaknessProfile (spec §9.1.6–7).
 * Pure and deterministic given the same inputs.
 */
import type { WeaknessProfile, WeaknessCategoryStat, ErrorInstance } from '../profile.js';
import type { WeaknessCategory } from '../taxonomy.js';
import { WEAKNESS_CATEGORIES } from '../taxonomy.js';
import { ALL_DETECTORS, type GameContext } from '../detectors/index.js';
import { clamp, normalizeUci } from './cpl.js';
import { aggregatePositionTypes } from './positionAggregate.js';

const LOW_CONFIDENCE_GAMES = 10; // spec §9.3
const DEFAULT_MAX_EXAMPLES = 10;
const TOP_N = 3; // spec §9.1.7

/**
 * Per-move categories claim each (gameId, ply) exactly once, by priority — the
 * specific "what" (hanging piece, missed tactic) beats the contextual
 * "where/when" (endgame, time trouble). Prevents a single mistake from being
 * counted in several categories (e.g. an endgame hang inflating ENDGAME_TECHNIQUE).
 * Categories absent here (FAILED_CONVERSION, POSITIONAL_DRIFT) are game-level and
 * exempt.
 */
const PER_MOVE_PRIORITY: Partial<Record<WeaknessCategory, number>> = {
  HANGING_PIECE: 1,
  MISSED_TACTIC: 2,
  WEAK_DEFENSE: 3,
  TIME_TROUBLE: 4,
  ENDGAME_TECHNIQUE: 5,
  OPENING_INACCURACY: 6,
};

/** Heuristic rating-points-lost estimate for one error instance from its CPL. */
export function instanceImpact(cpl: number): number {
  // ~4 rating points per pawn of centipawn loss, floored/capped for stability.
  return clamp((cpl / 100) * 4, 2, 60);
}

export interface AggregateInput {
  username: string;
  source: string;
  contexts: GameContext[];
  movesScored: number;
  engineMeta: WeaknessProfile['engineMeta'];
  /** max example positions per weakness (default 10, spec feedback #5) */
  maxExamples?: number;
  /** analysis scope surfaced to the user (spec feedback #6) */
  scope?: WeaknessProfile['scope'];
}

export function aggregateProfile(input: AggregateInput): WeaknessProfile {
  const maxExamples = input.maxExamples ?? DEFAULT_MAX_EXAMPLES;
  const byCategory = new Map<WeaknessCategory, ErrorInstance[]>();
  for (const cat of WEAKNESS_CATEGORIES) byCategory.set(cat, []);

  for (const ctx of input.contexts) {
    for (const detector of ALL_DETECTORS) {
      for (const instance of detector.detect(ctx)) {
        // Safety net: never surface an example where the played move IS the
        // engine's move ("you played X — better was X"). Not instructive.
        const sameSan =
          instance.betterMoveSan !== undefined && instance.betterMoveSan === instance.playedMove;
        const sameUci =
          instance.playedMoveUci !== undefined &&
          normalizeUci(instance.playedMoveUci) === normalizeUci(instance.betterMove);
        if (sameSan || sameUci) continue;
        byCategory.get(instance.category)!.push(instance);
      }
    }
  }

  dedupePerMoveInstances(byCategory);

  const categories: WeaknessCategoryStat[] = [];
  for (const cat of WEAKNESS_CATEGORIES) {
    const instances = byCategory.get(cat)!;
    if (instances.length === 0) continue;
    const estimatedRatingLoss = Math.round(
      instances.reduce((sum, i) => sum + instanceImpact(i.cpl), 0),
    );
    const examples = selectExamples(instances, maxExamples);
    categories.push({ category: cat, frequency: instances.length, estimatedRatingLoss, examples });
  }

  // Cross-tab: structural contexts where mistakes cluster. Uses every scored
  // move (denominator, via contexts) and all error instances (examples).
  const allInstances = [...byCategory.values()].flat();
  const positionTypes = aggregatePositionTypes(input.contexts, allInstances);

  // Rank by estimated rating loss, then frequency, then taxonomy order (stable).
  const ranked = [...categories].sort((a, b) => {
    if (b.estimatedRatingLoss !== a.estimatedRatingLoss)
      return b.estimatedRatingLoss - a.estimatedRatingLoss;
    if (b.frequency !== a.frequency) return b.frequency - a.frequency;
    return WEAKNESS_CATEGORIES.indexOf(a.category) - WEAKNESS_CATEGORIES.indexOf(b.category);
  });

  return {
    username: input.username,
    source: input.source,
    gamesAnalyzed: input.contexts.length,
    movesScored: input.movesScored,
    lowConfidence: input.contexts.length < LOW_CONFIDENCE_GAMES,
    categories,
    topWeaknesses: ranked.slice(0, TOP_N).map((c) => c.category),
    ...(positionTypes.length ? { positionTypes } : {}),
    engineMeta: input.engineMeta,
    ...(input.scope ? { scope: input.scope } : {}),
  };
}

/**
 * Enforce single-assignment: for each (gameId, ply) claimed by multiple per-move
 * categories, keep only the highest-priority category's instance.
 */
function dedupePerMoveInstances(byCategory: Map<WeaknessCategory, ErrorInstance[]>): void {
  const winner = new Map<string, number>(); // key -> best priority seen
  const keyOf = (i: ErrorInstance): string => `${i.gameId}:${i.ply}`;

  for (const [cat, instances] of byCategory) {
    const priority = PER_MOVE_PRIORITY[cat];
    if (priority === undefined) continue;
    for (const inst of instances) {
      const k = keyOf(inst);
      const best = winner.get(k);
      if (best === undefined || priority < best) winner.set(k, priority);
    }
  }

  for (const [cat, instances] of byCategory) {
    const priority = PER_MOVE_PRIORITY[cat];
    if (priority === undefined) continue;
    byCategory.set(
      cat,
      instances.filter((i) => winner.get(keyOf(i)) === priority),
    );
  }
}

/**
 * Pick the most instructive examples: prefer mistakes made in competitive
 * positions (turning an equal/near-equal game bad teaches more than a slip when
 * already winning/losing) and spread across distinct games, then by CPL.
 */
export function selectExamples(instances: ErrorInstance[], max: number): ErrorInstance[] {
  const scored = [...instances].sort((a, b) => instructiveness(b) - instructiveness(a));
  const seenGames = new Set<string>();
  const spread: ErrorInstance[] = [];
  const rest: ErrorInstance[] = [];
  // First pass: one per distinct game, in instructiveness order.
  for (const inst of scored) {
    if (!seenGames.has(inst.gameId)) {
      seenGames.add(inst.gameId);
      spread.push(inst);
    } else {
      rest.push(inst);
    }
  }
  return [...spread, ...rest].slice(0, max);
}

function instructiveness(i: ErrorInstance): number {
  // Competitive positions score higher: full weight near equality, decaying as
  // the position was already decided before the mistake.
  const competitiveness = 1 - Math.min(Math.abs(i.cpBefore) / 800, 0.85);
  return i.cpl * competitiveness;
}
