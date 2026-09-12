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
  lichessPuzzleFrom,
  sanForUci,
  type DrillDraft,
  type GoalFacts,
  type PlanDraft,
  type PuzzleCandidate,
  type WeaknessProfile,
  type WeaknessCategory,
  type LlmProvider,
} from '@chess-coach/core';
import type { PrismaClient, Prisma } from '@chess-coach/db';
import type { ChessEngine } from '@chess-coach/core';
import { explainPuzzleDrills, type DrillExplainOptions } from './drillExplain.js';

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
  engine?: ChessEngine,
  drillExplain?: DrillExplainOptions,
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
        select: { id: true, explanation: true },
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
              ...(drill.solutionLine ? { solutionLine: drill.solutionLine } : {}),
              ...(drill.solutionSan ? { solutionSan: drill.solutionSan } : {}),
              ...(drill.playedMoveSan ? { playedMoveSan: drill.playedMoveSan } : {}),
              ...(drill.gameId ? { gameId: drill.gameId } : {}),
              ...(drill.puzzleId ? { puzzleId: drill.puzzleId } : {}),
              ...(drill.note ? { note: drill.note } : {}),
              // Post-solve insight (own-game): copied from the report example
              // so the solved-drill panel shows full report parity.
              ...insightData(drill),
            },
            select: { id: true },
          })
        ).id;
      // Dedupe backfill: an older drill (created before insight existed) gains
      // the new report example's explanation without touching its SRS state.
      if (existing?.id && !existing.explanation) {
        const insight = insightData(drill);
        if (Object.keys(insight).length > 0) {
          await db.drill.update({ where: { id: existing.id }, data: insight });
        }
      }
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

  // Drill insight: analyze the plan's puzzle drills (never engine-analyzed
  // anywhere else) so the solved view can explain WHY the solution works.
  // Engine + LLM + DB writes; any failure leaves drills unexplained — the
  // plan itself is complete and must not be lost.
  if (engine && drillExplain && drillExplain.maxDrills > 0) {
    try {
      const result = await explainPuzzleDrills(db, [...linkedDrillIds], engine, llm, drillExplain);
      if (result.explained > 0) {
        console.log(`[plan] explained ${result.explained} puzzle drill(s)`);
      }
    } catch (err) {
      console.warn(
        '[plan] puzzle drill insight failed (plan unaffected):',
        err instanceof Error ? err.message : err,
      );
    }
  }

  return plan.id;
}

/** Create/update data carrying a DrillDraft's insight fields, if any. */
function insightData(
  drill: Pick<DrillDraft, 'explanation' | 'variations' | 'cpBefore' | 'cpAfter'>,
): {
  explanation?: Prisma.InputJsonValue;
  variations?: Prisma.InputJsonValue;
  cpBefore?: number;
  cpAfter?: number;
} {
  return {
    ...(drill.explanation
      ? { explanation: drill.explanation as unknown as Prisma.InputJsonValue }
      : {}),
    ...(drill.variations?.length
      ? { variations: drill.variations as unknown as Prisma.InputJsonValue }
      : {}),
    ...(drill.cpBefore !== undefined ? { cpBefore: drill.cpBefore } : {}),
    ...(drill.cpAfter !== undefined ? { cpAfter: drill.cpAfter } : {}),
  };
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
      const candidates: PuzzleCandidate[] = [];
      for (const r of rows) {
        // Lichess convention: the stored FEN is one move before the puzzle and
        // the first line move is the opponent's setup move — normalize here.
        const pz = lichessPuzzleFrom(r.fen, r.line);
        if (!pz) continue;
        candidates.push({
          externalId: r.externalId,
          fen: pz.fen,
          solutionUci: pz.solutionUci,
          solutionLine: pz.solutionLine,
          solutionSan: sanForUci(pz.fen, pz.solutionUci),
          rating: r.rating,
        });
      }
      out[theme] = candidates;
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
