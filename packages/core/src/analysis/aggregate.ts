/**
 * Aggregate detector output into a ranked WeaknessProfile (spec §9.1.6–7).
 * Pure and deterministic given the same inputs.
 */
import type { WeaknessProfile, WeaknessCategoryStat, ErrorInstance } from '../profile.js';
import type { WeaknessCategory } from '../taxonomy.js';
import { WEAKNESS_CATEGORIES } from '../taxonomy.js';
import { ALL_DETECTORS, type GameContext } from '../detectors/index.js';
import { clamp } from './cpl.js';

const LOW_CONFIDENCE_GAMES = 10; // spec §9.3
const MAX_EXAMPLES = 3; // spec §9.1.6
const TOP_N = 3; // spec §9.1.7

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
}

export function aggregateProfile(input: AggregateInput): WeaknessProfile {
  const byCategory = new Map<WeaknessCategory, ErrorInstance[]>();
  for (const cat of WEAKNESS_CATEGORIES) byCategory.set(cat, []);

  for (const ctx of input.contexts) {
    for (const detector of ALL_DETECTORS) {
      for (const instance of detector.detect(ctx)) {
        byCategory.get(instance.category)!.push(instance);
      }
    }
  }

  const categories: WeaknessCategoryStat[] = [];
  for (const cat of WEAKNESS_CATEGORIES) {
    const instances = byCategory.get(cat)!;
    if (instances.length === 0) continue;
    const estimatedRatingLoss = Math.round(
      instances.reduce((sum, i) => sum + instanceImpact(i.cpl), 0),
    );
    const examples = [...instances]
      .sort((a, b) => b.cpl - a.cpl)
      .slice(0, MAX_EXAMPLES);
    categories.push({ category: cat, frequency: instances.length, estimatedRatingLoss, examples });
  }

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
    engineMeta: input.engineMeta,
  };
}
