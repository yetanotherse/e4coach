import { describe, it, expect } from 'vitest';
import { MockLlmProvider } from '@chess-coach/adapters';
import type { PrismaClient } from '@chess-coach/db';
import type { WeaknessProfile, ErrorInstance } from '@chess-coach/core';
import { generateTrainingPlan } from './plan.js';

/**
 * In-memory stand-in for Prisma covering exactly the calls
 * generateTrainingPlan makes — lets us test plan persistence + due-drill
 * resurfacing (plans/phase-2.md 2.3) with zero infrastructure.
 */
function fakeDb() {
  const drills: Array<Record<string, unknown> & { id: string; drillLinks?: Set<string> }> = [];
  const items: Array<
    Record<string, unknown> & { id: string; planId: string; linkedDrillIds: Set<string> }
  > = [];
  const plans: Array<Record<string, unknown> & { id: string; itemIds: string[] }> = [];
  let seq = 0;
  const id = () => `id${++seq}`;

  const db = {
    puzzle: { count: async () => 0 },
    trainingPlan: {
      updateMany: async ({
        where,
      }: {
        where: { userId: string; weekStart: Date; status: string };
      }) => {
        for (const p of plans) {
          if (
            p.userId === where.userId &&
            (p.weekStart as Date).getTime() === where.weekStart.getTime() &&
            p.status === where.status
          ) {
            p.status = 'superseded';
          }
        }
        return { count: 0 };
      },
      create: async ({
        data,
      }: {
        data: {
          userId: string;
          weekStart: Date;
          sourceReportId?: string;
          status: string;
          items: { create: Array<{ theme: string; goal: string }> };
        };
      }) => {
        const plan = { id: id(), ...data, itemIds: [] as string[] };
        const createdItems = data.items.create.map((i) => {
          const item = {
            id: id(),
            planId: plan.id,
            theme: i.theme,
            goal: i.goal,
            linkedDrillIds: new Set<string>(),
          };
          items.push(item);
          plan.itemIds.push(item.id);
          return item;
        });
        plans.push(plan);
        return { ...plan, items: createdItems };
      },
    },
    drill: {
      findFirst: async ({
        where,
      }: {
        where: {
          userId: string;
          puzzleId?: string;
          theme?: string;
          fen?: string;
          solutionUci?: string;
        };
      }) => {
        const found = drills.find(
          (d) =>
            d.userId === where.userId &&
            (where.puzzleId
              ? d.puzzleId === where.puzzleId
              : d.theme === where.theme &&
                d.fen === where.fen &&
                d.solutionUci === where.solutionUci),
        );
        return found ? { id: found.id, explanation: found.explanation ?? null } : null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const drill = {
          id: id(),
          ...data,
          dueAt: new Date(),
          intervalDays: 0,
          ease: 2.5,
          reviewCount: 0,
        };
        drills.push(drill);
        return { id: drill.id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const drill = drills.find((d) => d.id === where.id);
        if (!drill) throw new Error(`unknown drill ${where.id}`);
        Object.assign(drill, data);
        return drill;
      },
      findMany: async ({
        where,
      }: {
        where: { userId: string; dueAt: { lte: Date }; theme: { in: string[] } };
      }) =>
        drills
          .filter(
            (d) =>
              d.userId === where.userId &&
              (d.dueAt as Date).getTime() <= where.dueAt.lte.getTime() &&
              where.theme.in.includes(d.theme as string),
          )
          .map((d) => ({ id: d.id, theme: d.theme, dueAt: d.dueAt })),
    },
    planItem: {
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { drills: { connect: { id: string } } };
      }) => {
        const item = items.find((i) => i.id === where.id);
        if (!item) throw new Error(`unknown plan item ${where.id}`);
        item.linkedDrillIds.add(data.drills.connect.id);
        return item;
      },
    },
  } as unknown as PrismaClient;
  return { db, drills, items, plans };
}

const FEN_1 = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1';

function example(overrides: Partial<ErrorInstance> = {}): ErrorInstance {
  return {
    category: 'HANGING_PIECE',
    gameId: 'g1',
    moveNumber: 12,
    ply: 23,
    fen: FEN_1,
    playedMove: 'Qxf7#?',
    playedMoveUci: 'f3f7',
    betterMove: 'f3d3',
    betterMoveSan: 'Qd3',
    cpl: 350,
    cpBefore: 40,
    cpAfter: -280,
    assessment: 'balanced (+0.4)',
    userColor: 'white',
    note: 'the queen went off to be captured',
    ...overrides,
  };
}

function profile(overrides: Partial<WeaknessProfile> = {}): WeaknessProfile {
  return {
    username: 'mockuser',
    source: 'lichess',
    gamesAnalyzed: 12,
    movesScored: 400,
    lowConfidence: false,
    categories: [
      { category: 'HANGING_PIECE', frequency: 6, estimatedRatingLoss: 180, examples: [example()] },
    ],
    topWeaknesses: ['HANGING_PIECE'],
    engineMeta: { kind: 'mock' },
    ...overrides,
  };
}

const NOW = new Date('2026-09-09T15:00:00Z'); // a Wednesday

describe('generateTrainingPlan — due-drill resurfacing (plans/phase-2.md 2.3)', () => {
  it('links fresh draft drills into the plan', async () => {
    const { db, items, drills } = fakeDb();
    const planId = await generateTrainingPlan(
      db,
      { userId: 'u1', profile: profile(), reportId: 'r1' },
      new MockLlmProvider(),
      NOW,
    );
    expect(planId).toBeTruthy();
    expect(drills).toHaveLength(1);
    expect(items[0]!.linkedDrillIds.size).toBe(1);
  });

  it('resurfaces due drills of a focus theme into the new plan, most overdue first', async () => {
    const { db, items, drills } = fakeDb();
    // Two pre-existing due drills of the focus theme, plus a fresh draft drill.
    const dueA = {
      id: 'dueA',
      userId: 'u1',
      theme: 'HANGING_PIECE',
      dueAt: new Date('2026-09-05T00:00:00Z'),
    };
    const dueB = {
      id: 'dueB',
      userId: 'u1',
      theme: 'HANGING_PIECE',
      dueAt: new Date('2026-09-08T00:00:00Z'),
    };
    drills.push(dueA, dueB);

    await generateTrainingPlan(
      db,
      { userId: 'u1', profile: profile(), reportId: 'r1' },
      new MockLlmProvider(),
      NOW,
    );

    const linked = [...items[0]!.linkedDrillIds];
    // draft drill + both due drills, dueA (more overdue) before dueB
    expect(linked).toHaveLength(3);
    expect(linked.indexOf('dueA')).toBeLessThan(linked.indexOf('dueB'));
  });

  it('does not resurface off-theme or not-yet-due drills', async () => {
    const { db, items, drills } = fakeDb();
    drills.push(
      {
        id: 'offTheme',
        userId: 'u1',
        theme: 'MISSED_TACTIC',
        dueAt: new Date('2026-09-01T00:00:00Z'),
      },
      {
        id: 'otherUser',
        userId: 'u2',
        theme: 'HANGING_PIECE',
        dueAt: new Date('2026-09-01T00:00:00Z'),
      },
      {
        id: 'notDue',
        userId: 'u1',
        theme: 'HANGING_PIECE',
        dueAt: new Date('2026-09-20T00:00:00Z'),
      },
    );

    await generateTrainingPlan(
      db,
      { userId: 'u1', profile: profile(), reportId: 'r1' },
      new MockLlmProvider(),
      NOW,
    );

    expect(items[0]!.linkedDrillIds.size).toBe(1); // only the fresh draft drill
  });

  it('caps resurfaced drills per theme and never double-links', async () => {
    const { db, items, drills } = fakeDb();
    for (let i = 0; i < 5; i++) {
      drills.push({
        id: `due${i}`,
        userId: 'u1',
        theme: 'HANGING_PIECE',
        dueAt: new Date(2026, 8, 1 + i),
      });
    }

    await generateTrainingPlan(
      db,
      { userId: 'u1', profile: profile(), reportId: 'r1' },
      new MockLlmProvider(),
      NOW,
    );

    // 1 fresh draft drill + 3 resurfaced (default cap)
    expect(items[0]!.linkedDrillIds.size).toBe(4);
  });

  it('dedupes re-analyzed positions — existing drills are re-linked, not duplicated', async () => {
    const { db, drills, items } = fakeDb();
    // First analysis creates the drill.
    await generateTrainingPlan(
      db,
      { userId: 'u1', profile: profile(), reportId: 'r1' },
      new MockLlmProvider(),
      NOW,
    );
    expect(drills).toHaveLength(1);
    // Drill has review history: it was solved and scheduled out.
    drills[0]!.reviewCount = 2;
    drills[0]!.intervalDays = 3;
    drills[0]!.dueAt = new Date('2026-09-20T00:00:00Z');

    // Re-analysis the same week: same position, new plan.
    await generateTrainingPlan(
      db,
      { userId: 'u1', profile: profile(), reportId: 'r2' },
      new MockLlmProvider(),
      NOW,
    );

    expect(drills).toHaveLength(1); // no duplicate
    expect(items[1]!.linkedDrillIds.has(drills[0]!.id)).toBe(true); // re-linked
    expect(drills[0]!.reviewCount).toBe(2); // SRS state untouched by plan generation
  });

  it('persists the report example insight onto new own-game drills', async () => {
    const { db, drills } = fakeDb();
    const explained = profile({
      categories: [
        {
          category: 'HANGING_PIECE',
          frequency: 6,
          estimatedRatingLoss: 180,
          examples: [
            example({
              explanation: {
                whatWentWrong: 'the queen steps away from its guard',
                whyBetter: 'Qd3 keeps the queen protected',
                takeaway: 'check what can be captured',
                source: 'llm',
              },
              variations: [
                {
                  kind: 'refutation',
                  label: 'You played Qxf7#?',
                  startFen: FEN_1,
                  sans: ['Qxf7#'],
                },
              ],
            }),
          ],
        },
      ],
    });
    await generateTrainingPlan(
      db,
      { userId: 'u1', profile: explained, reportId: 'r1' },
      new MockLlmProvider(),
      NOW,
    );
    expect(drills[0]!.explanation).toEqual({
      whatWentWrong: 'the queen steps away from its guard',
      whyBetter: 'Qd3 keeps the queen protected',
      takeaway: 'check what can be captured',
      source: 'llm',
    });
  });

  it('backfills insight onto a pre-existing unexplained drill without touching SRS state', async () => {
    const { db, drills } = fakeDb();
    // First analysis: an old report without deep-pass insight.
    await generateTrainingPlan(
      db,
      { userId: 'u1', profile: profile(), reportId: 'r1' },
      new MockLlmProvider(),
      NOW,
    );
    expect(drills[0]!.explanation).toBeUndefined();
    drills[0]!.reviewCount = 4; // solve history accumulated since
    drills[0]!.dueAt = new Date('2026-09-25T00:00:00Z');

    // Re-analysis: the new report now carries an explanation for the position.
    const explained = profile({
      categories: [
        {
          category: 'HANGING_PIECE',
          frequency: 6,
          estimatedRatingLoss: 180,
          examples: [
            example({
              explanation: {
                whatWentWrong: 'the queen walks into a capture',
                whyBetter: 'Qd3 keeps the queen safe',
                takeaway: 'count defenders first',
                source: 'template',
              },
            }),
          ],
        },
      ],
    });
    await generateTrainingPlan(
      db,
      { userId: 'u1', profile: explained, reportId: 'r2' },
      new MockLlmProvider(),
      NOW,
    );

    expect(drills).toHaveLength(1); // still deduped, not duplicated
    expect((drills[0]!.explanation as { takeaway?: string } | undefined)?.takeaway).toBe(
      'count defenders first',
    );
    expect(drills[0]!.reviewCount).toBe(4); // SRS state untouched
  });

  it('does not overwrite an existing explanation on re-analysis', async () => {
    const { db, drills } = fakeDb();
    const explained = profile({
      categories: [
        {
          category: 'HANGING_PIECE',
          frequency: 6,
          estimatedRatingLoss: 180,
          examples: [
            example({
              explanation: {
                whatWentWrong: 'first',
                whyBetter: 'first',
                takeaway: 'first',
                source: 'llm',
              },
            }),
          ],
        },
      ],
    });
    await generateTrainingPlan(
      db,
      { userId: 'u1', profile: explained, reportId: 'r1' },
      new MockLlmProvider(),
      NOW,
    );
    // Re-analysis produces DIFFERENT prose; the original must be kept.
    const again = profile({
      categories: [
        {
          category: 'HANGING_PIECE',
          frequency: 6,
          estimatedRatingLoss: 180,
          examples: [
            example({
              explanation: {
                whatWentWrong: 'second',
                whyBetter: 'second',
                takeaway: 'second',
                source: 'llm',
              },
            }),
          ],
        },
      ],
    });
    await generateTrainingPlan(
      db,
      { userId: 'u1', profile: again, reportId: 'r2' },
      new MockLlmProvider(),
      NOW,
    );
    expect((drills[0]!.explanation as { takeaway?: string } | undefined)?.takeaway).toBe('first');
  });
});
