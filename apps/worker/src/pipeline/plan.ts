/**
 * Training-plan generation (plans/phase-2.md 2.2a). Runs after a report is
 * persisted: assemble the weekly plan from the profile (deterministic), try to
 * rephrase the goals with the LLM (optional, template fallback), then persist
 * plan + items + drills. Drills are user-owned and deduped by
 * (user, theme, fen, solution) so re-analysis re-links existing drills instead
 * of duplicating them, which keeps attempt history stable for SRS (2.3).
 * A failure here must never fail the analysis job — the report is the product.
 */
import {
  buildPlanDraft,
  buildPlanMessages,
  CATEGORY_META,
  DEFAULT_MAX_THEMES,
  pickResurfaceDrills,
  PLAN_JSON_SCHEMA,
  LlmPlanSchema,
  type GoalFacts,
  type PlanDraft,
  type PuzzleCandidate,
  type WeaknessProfile,
  type WeaknessCategory,
  type LlmProvider,
} from '@chess-coach/core';
import type { PrismaClient } from '@chess-coach/db';

/** Rating band for puzzle drills: the adult-improver beachhead (spec §1). */
const PUZZLE_RATING_MIN = 800;
const PUZZLE_RATING_MAX = 1600;

export interface GeneratePlanInput {
  userId: string;
  profile: WeaknessProfile;
  reportId: string;
}

/**
 * Upsert this week's plan. Same-week plans are marked superseded (only one
 * active per user+week); drills are deduped and re-linked to the new items.
 */
export async function generateTrainingPlan(
  db: PrismaClient,
  input: { userId: string; profile: WeaknessProfile; reportId: string },
  llm: LlmProvider,
  now: Date = new Date(),
): Promise<string | null> {
  const focusThemes = input.profile.topWeaknesses.slice(0, DEFAULT_MAX_THEMES);
  const draft = buildPlanDraft(input.profile, {
    now,
    puzzlesByTheme: await fetchPuzzleCandidates(db, focusThemes),
  });
  if (draft.items.length === 0) {
    console.log('[plan] no drillable weaknesses — no plan generated');
    return null;
  }

  const items = await phraseGoals(draft, input.profile, llm);

  // Supersede any other active plan for the same week, then create the new one.
  await db.trainingPlan.updateMany({
    where: {
      userId: input.userId,
      weekStart: draft.weekStart,
      status: 'active',
    },
    data: { status: 'superseded' },
  });

  const plan = await db.trainingPlan.create({
    data: {
      userId: input.userId,
      weekStart: draft.weekStart,
      sourceReportId: input.reportId,
      status: 'active',
      items: {
        create: items.map((item) => ({
          theme: item.theme,
          goal: item.goal,
        })),
      },
    },
    include: { items: true },
  });

  const linkedDrillIds = new Set<string>();
  for (const item of plan.items) {
    const drillsForTheme = draft.items.find((d) => d.theme === item.theme)?.drills ?? [];
    for (const drill of drillsForTheme) {
      // Puzzle drills dedupe on the puzzle id; own-game drills on the position.
      const existing = await db.drill.findFirst({
        where: drill.puzzleId
          ? { userId: input.userId, puzzleId: drill.puzzleId }
          : {
              userId: input.userId,
              theme: drill.theme,
              fen: drill.fen,
              solutionUci: drill.solutionUci,
            },
        select: { id: true },
      });
      const drillId =
        existing?.id ??
        (
          await db.drill.create({
            data: {
              userId: input.userId,
              type: drill.type,
              theme: drill.theme,
              fen: drill.fen,
              sideToMove: drill.sideToMove,
              solutionUci: drill.solutionUci,
              ...(drill.solutionSan ? { solutionSan: drill.solutionSan } : {}),
              ...(drill.playedMoveSan ? { playedMoveSan: drill.playedMoveSan } : {}),
              ...(drill.gameId ? { gameId: drill.gameId } : {}),
              ...(drill.puzzleId ? { puzzleId: drill.puzzleId } : {}),
              ...(drill.note ? { note: drill.note } : {}),
            },
            select: { id: true },
          })
        ).id;
      await db.planItem.update({
        where: { id: item.id },
        data: { drills: { connect: { id: drillId } } },
      });
      linkedDrillIds.add(drillId);
    }
  }

  // Recurring-theme resurfacing (plans/phase-2.md 2.3): due drills whose theme
  // is one of this week's focus themes are linked into the plan too, so spaced
  // repetition resurfaces them in context. Most overdue first, a few per theme.
  const dueDrills = await db.drill.findMany({
    where: { userId: input.userId, dueAt: { lte: now }, theme: { in: focusThemes } },
    select: { id: true, theme: true, dueAt: true },
  });
  let resurfaced = 0;
  for (const item of plan.items) {
    const ids = pickResurfaceDrills(dueDrills, item.theme, linkedDrillIds);
    for (const id of ids) {
      await db.planItem.update({
        where: { id: item.id },
        data: { drills: { connect: { id } } },
      });
      linkedDrillIds.add(id);
      resurfaced++;
    }
  }

  const drillTotal = draft.items.reduce((n, i) => n + i.drills.length, 0);
  console.log(
    `[plan] plan ${plan.id} created (${items.length} themes, ${drillTotal} drills, ${resurfaced} resurfaced)`,
  );
  return plan.id;
}

/**
 * Thematic puzzle candidates per focus theme (plans/phase-2.md 2.2b), drawn
 * from the ingested Lichess puzzle slice. A deterministic-ish random offset
 * varies the pool between analyses without a DB-level shuffle. Best effort:
 * an empty/unavailable puzzle table simply yields no puzzle drills.
 */
async function fetchPuzzleCandidates(
  db: PrismaClient,
  themes: readonly WeaknessCategory[],
): Promise<Partial<Record<WeaknessCategory, PuzzleCandidate[]>>> {
  const out: Partial<Record<WeaknessCategory, PuzzleCandidate[]>> = {};
  for (const theme of themes) {
    try {
      const where = { category: theme, rating: { gte: PUZZLE_RATING_MIN, lte: PUZZLE_RATING_MAX } };
      const count = await db.puzzle.count({ where });
      if (count === 0) continue;
      const take = 8; // a little slack above the assembler's per-theme cap
      const skip = count > take ? Math.floor(Math.random() * (count - take)) : 0;
      const rows = await db.puzzle.findMany({ where, orderBy: { externalId: 'asc' }, skip, take });
      out[theme] = rows.map((r) => ({
        externalId: r.externalId,
        fen: r.fen,
        solutionUci: r.solutionUci,
        rating: r.rating,
      }));
    } catch (err) {
      console.warn(
        `[plan] puzzle candidates for ${theme} unavailable:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return out;
}

/** Try to rephrase the template goals with the LLM; fall back on any failure. */ async function phraseGoals(
  draft: PlanDraft,
  profile: WeaknessProfile,
  llm: LlmProvider,
): Promise<Array<{ theme: string; goal: string }>> {
  const template = draft.items.map((item) => ({
    theme: item.theme as string,
    goal: item.goal,
  }));
  try {
    const facts: GoalFacts[] = draft.items.map((item) => ({
      theme: item.theme,
      displayName: CATEGORY_META[item.theme].displayName,
      instanceCount: profile.categories.find((c) => c.category === item.theme)?.frequency ?? 0,
      drillCount: item.drills.length,
    }));
    const res = await llm.generate(buildPlanMessages(facts), {
      responseFormat: 'json',
      jsonSchema: PLAN_JSON_SCHEMA as unknown as Record<string, unknown>,
      metadata: { purpose: 'plan-goals' },
    });
    const parsed = LlmPlanSchema.safeParse(res.parsed ?? JSON.parse(res.text));
    if (!parsed.success) return template;
    return mergeOnlyKnownThemes(template, parsed.data);
  } catch (err) {
    console.warn(
      '[plan] LLM goal phrasing failed, using template goals:',
      err instanceof Error ? err.message : err,
    );
    return template;
  }
}

/** Only accept goals for themes that are actually in the draft. */
function mergeOnlyKnownThemes(
  template: Array<{ theme: string; goal: string }>,
  llm: { goals: Array<{ theme: string; goal: string }> },
): Array<{ theme: string; goal: string }> {
  const byTheme = new Map(llm.goals.map((g) => [g.theme, g.goal]));
  return template.map((t) => {
    const goal = byTheme.get(t.theme);
    return goal ? { ...t, goal } : t;
  });
}
