/**
 * Deterministic weekly-plan assembly (plans/phase-2.md 2.2a). Takes the
 * WeaknessProfile's ranked top weaknesses and turns the top themes' example
 * positions into drills, with template goal prose. The LLM can only rephrase
 * the goal prose (see prompts/plan.ts) — items, drills, and order are all
 * computed here so the plan is correct even with the model unavailable.
 */
import type { WeaknessProfile } from '../profile.js';
import { CATEGORY_META } from '../taxonomy.js';
import type { DrillDraft, GoalFacts, PlanDraft, PlanItemDraft, PlanOptions } from './types.js';

export const DEFAULT_MAX_THEMES = 2;
export const DEFAULT_DRILLS_PER_THEME = 5;

/** Monday 00:00 UTC of the week containing `now`. */
export function weekStartFor(now: Date): Date {
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const offset = (day.getUTCDay() + 6) % 7; // 0 = Monday
  day.setUTCDate(day.getUTCDate() - offset);
  return day;
}

/** Template goal prose: taxonomy description + this week's concrete work. */
export function templateGoal(facts: GoalFacts): string {
  const meta = CATEGORY_META[facts.theme];
  const n = facts.drillCount;
  const positions =
    n === 1 ? '1 position' : `${n} positions`;
  return `${meta.description} This week: re-solve ${positions} from your own games until the safe move pattern feels automatic.`;
}

/**
 * Assemble the plan draft: top themes by impact (the profile's topWeaknesses
 * order), drills from that theme's real example positions. Themes without
 * examples are skipped — a goal with no drills is empty homework.
 */
export function buildPlanDraft(
  profile: WeaknessProfile,
  opts: PlanOptions = {},
): PlanDraft {
  const maxThemes = opts.maxThemes ?? DEFAULT_MAX_THEMES;
  const drillsPerTheme = opts.drillsPerTheme ?? DEFAULT_DRILLS_PER_THEME;
  const now = opts.now ?? new Date();

  const items: PlanItemDraft[] = [];
  for (const category of profile.topWeaknesses.slice(0, maxThemes)) {
    const stat = profile.categories.find((c) => c.category === category);
    if (!stat || stat.examples.length === 0) continue;

    const drills: DrillDraft[] = stat.examples.slice(0, drillsPerTheme).map((ex) => ({
      type: 'own_game',
      theme: category,
      fen: ex.fen,
      sideToMove: ex.userColor,
      solutionUci: ex.betterMove,
      ...(ex.betterMoveSan ? { solutionSan: ex.betterMoveSan } : {}),
      playedMoveSan: ex.playedMove,
      gameId: ex.gameId,
      ...(ex.note ? { note: ex.note } : {}),
    }));

    items.push({
      theme: category,
      goal: templateGoal({
        theme: category,
        displayName: CATEGORY_META[category].displayName,
        instanceCount: stat.frequency,
        drillCount: drills.length,
      }),
      drills,
    });
  }

  return { weekStart: weekStartFor(now), items };
}
