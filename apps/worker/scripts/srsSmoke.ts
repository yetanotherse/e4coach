/**
 * Live SRS smoke (plans/phase-2.md 2.3) — simulates the exact sequence the
 * attempt route performs, against the real DB, for a throwaway user:
 *   clean solve → due +1d, reviewCount 1
 *   grind solve (2 lapses) → ease drop, reset, due +1d
 *   clean solve → due +3d
 *   resurfacing selection → due drill picked for a plan item
 * Cleans up after itself. Run: pnpm --filter worker exec tsx ../../scripts/srsSmoke.ts
 */
import { PrismaClient } from '@chess-coach/db';
import { dueAtFor, isDue, nextSrsState, pickResurfaceDrills } from '@chess-coach/core';

const db = new PrismaClient();
const email = `srs-smoke-${Date.now()}@example.com`;

async function solve(drillId: string, lapses: number) {
  // mirrors apps/web/app/api/drills/[id]/attempt/route.ts
  const drill = await db.drill.findUniqueOrThrow({
    where: { id: drillId },
    select: {
      intervalDays: true,
      ease: true,
      reviewCount: true,
      dueAt: true,
      lastReviewedAt: true,
    },
  });
  const wasDue = isDue(drill.dueAt, new Date());
  const srs = nextSrsState(
    { intervalDays: drill.intervalDays, ease: drill.ease, reviewCount: drill.reviewCount },
    { lapses },
  );
  const now = new Date();
  await db.drill.update({
    where: { id: drillId },
    data: {
      intervalDays: srs.intervalDays,
      ease: srs.ease,
      reviewCount: srs.reviewCount,
      dueAt: dueAtFor(now, srs.intervalDays),
      lastReviewedAt: now,
    },
  });
  return { wasDue, ...srs };
}

async function main() {
  const user = await db.user.create({ data: { email } });
  const check = (ok: boolean, label: string) => {
    if (!ok) throw new Error(`check failed: ${label}`);
    console.log('✓', label);
  };
  try {
    const drill = await db.drill.create({
      data: {
        userId: user.id,
        theme: 'HANGING_PIECE',
        fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
        sideToMove: 'white',
        solutionUci: 'f3d3',
      },
    });

    // new drill: due immediately
    const fresh = await db.drill.findUniqueOrThrow({ where: { id: drill.id } });
    check(isDue(fresh.dueAt, new Date()), 'new drill is due immediately');

    const r1 = await solve(drill.id, 0);
    check(r1.wasDue && r1.intervalDays === 1 && r1.reviewCount === 1, 'clean solve → due in 1 day');

    const r2 = await solve(drill.id, 2);
    check(
      r2.ease === 2.3 && r2.reviewCount === 0 && r2.intervalDays === 1,
      'grind solve → ease 2.3, reset, 1 day',
    );

    const r3 = await solve(drill.id, 0);
    check(r3.intervalDays === 1 && r3.reviewCount === 1, 're-learned → restart at 1 day');

    const r4 = await solve(drill.id, 0);
    check(r4.intervalDays === 3 && r4.reviewCount === 2, 'second clean solve → 3 days');

    const after = await db.drill.findUniqueOrThrow({ where: { id: drill.id } });
    check(!isDue(after.dueAt, new Date()), 'dueAt persisted in the future');
    check(after.lastReviewedAt !== null, 'lastReviewedAt persisted');

    // Resurfacing selection: the pure selector picks most-overdue first;
    // due-ness filtering happens in the worker's DB query (dueAt <= now).
    const futureDue = new Date(Date.now() + 3 * 86_400_000);
    check(
      pickResurfaceDrills(
        [{ id: drill.id, theme: 'HANGING_PIECE', dueAt: futureDue }],
        'HANGING_PIECE',
        new Set(),
      ).length === 1,
      'selector picks supplied due drills (worker query filters due-ness)',
    );
    check(
      pickResurfaceDrills(
        [{ id: drill.id, theme: 'HANGING_PIECE', dueAt: futureDue }],
        'MISSED_TACTIC',
        new Set(),
      ).length === 0,
      'selector filters by theme',
    );
    check(
      pickResurfaceDrills(
        [{ id: drill.id, theme: 'HANGING_PIECE', dueAt: futureDue }],
        'HANGING_PIECE',
        new Set([drill.id]),
      ).length === 0,
      'selector excludes already-linked drills',
    );

    console.log('SRS SMOKE PASS');
  } finally {
    await db.user.delete({ where: { id: user.id } }); // cascades to drill
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error('SRS SMOKE FAIL', err);
  process.exit(1);
});
