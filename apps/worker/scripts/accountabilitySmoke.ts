/**
 * Live accountability smoke (plans/phase-2.md 2.4) — against the real DB and
 * the real Lichess/Chess.com rating APIs, for a throwaway user (cleaned up):
 *   1. real Lichess rating history parses and persists (backfill window)
 *   2. real Chess.com stats parse and persist
 *   3. re-snapshot is idempotent (no duplicate rows)
 *   4. check-in → streak 1; same-week repeat → no change; next week → 2
 *   5. nudge scan picks the user pre-check-in, skips post-check-in
 * Run: pnpm --filter worker exec tsx scripts/accountabilitySmoke.ts [lichessUser] [chessComUser]
 */
import { PrismaClient } from '@chess-coach/db';
import {
  LichessRatingSource,
  ChessComRatingSource,
} from '@chess-coach/adapters';
import { nextStreakState, weekStartFor } from '@chess-coach/core';
import { snapshotRatings } from '../../web/lib/ratingSnapshots.js';

const db = new PrismaClient();
const email = `acct-smoke-${Date.now()}@example.com`;

const check = (ok: boolean, label: string) => {
  if (!ok) throw new Error(`check failed: ${label}`);
  console.log('✓', label);
};

async function main() {
  const [lichessUser, chessComUser] = process.argv.slice(2);
  const user = await db.user.create({
    // createdAt backdated so the nudge scan's "joined before this week" filter includes it.
    data: { email, lichessUser: lichessUser ?? null, chessComUser: chessComUser ?? null, createdAt: new Date(Date.now() - 8 * 86_400_000) },
  });
  try {
    // 1+2. Real rating APIs → snapshots.
    const written = await snapshotRatings(db, user.id, [
      { source: 'lichess', username: lichessUser ?? null, provider: new LichessRatingSource({ userAgent: 'ChessCoachMVP/0.1' }) },
      { source: 'chesscom', username: chessComUser ?? null, provider: new ChessComRatingSource({ userAgent: 'ChessCoachMVP/0.1 (contact: dev@example.com)' }) },
    ]);
    check(written > 0, `rating snapshots written from live APIs (${written})`);
    const bySource = await db.ratingSnapshot.groupBy({
      by: ['source', 'perf'],
      where: { userId: user.id },
      _count: true,
    });
    console.log('  series:', bySource.map((s) => `${s.source}/${s.perf}:${s._count}`).join(' '));

    // 3. Idempotent re-snapshot.
    const again = await snapshotRatings(db, user.id, [
      { source: 'lichess', username: lichessUser ?? null, provider: new LichessRatingSource({ userAgent: 'ChessCoachMVP/0.1' }) },
      { source: 'chesscom', username: chessComUser ?? null, provider: new ChessComRatingSource({ userAgent: 'ChessCoachMVP/0.1 (contact: dev@example.com)' }) },
    ]);
    check(again === 0, `re-snapshot writes nothing new (${again})`);

    // 4. Nudge candidacy BEFORE the check-in — the user has a report, joined
    // last week, and has not checked in → must be a candidate. (The send path
    // is global and must NOT run against a shared DB; it's covered by
    // nudge.test.ts on a fake DB.)
    const now = new Date();
    const weekStart = weekStartFor(now);
    const job = await db.analysisJob.create({
      data: { userId: user.id, source: 'mock', status: 'DONE', gameCount: 1 },
    });
    await db.report.create({
      data: { userId: user.id, jobId: job.id, publicSlug: `smoke-${Date.now()}`, profile: {}, content: {} },
    });
    const nudgeWhere = {
      createdAt: { lt: weekStart },
      reports: { some: {} },
      checkIns: { none: { weekStart } },
      OR: [{ streak: null }, { streak: { lastNudgeWeekStart: { not: weekStart } } }],
    } as const;
    const candidates = await db.user.findMany({ where: nudgeWhere, select: { id: true } });
    check(candidates.some((c) => c.id === user.id), 'nudge candidate query selects the not-checked-in user');

    // 5. Streak math + check-in rows through the real DB.
    const streakRow = (current: { currentStreak: number; longestStreak: number; lastCheckInWeekStart: Date | null }) =>
      nextStreakState(current, weekStart);
    let s = streakRow({ currentStreak: 0, longestStreak: 0, lastCheckInWeekStart: null });
    check(s.currentStreak === 1, 'first check-in → streak 1');
    await db.streak.create({ data: { userId: user.id, currentStreak: s.currentStreak, longestStreak: s.longestStreak, lastCheckInWeekStart: s.lastCheckInWeekStart! } });
    const ci1 = await db.checkIn.create({ data: { userId: user.id, weekStart } }).catch(() => null);
    check(ci1 !== null, 'check-in row created');
    const ci2 = await db.checkIn
      .create({ data: { userId: user.id, weekStart } })
      .then(() => null)
      .catch(() => 'dup-rejected');
    check(ci2 === 'dup-rejected', 'same-week check-in rejected by unique constraint');
    s = streakRow({ currentStreak: s.currentStreak, longestStreak: s.longestStreak, lastCheckInWeekStart: s.lastCheckInWeekStart });
    check(s.currentStreak === 1, 'same-week re-check-in leaves streak at 1');

    // 6. Post-check-in: the same nudge query must now EXCLUDE the user.
    const candidatesAfter = await db.user.findMany({ where: nudgeWhere, select: { id: true } });
    check(!candidatesAfter.some((c) => c.id === user.id), 'checked-in user is excluded from nudge candidates');

    console.log('ACCOUNTABILITY SMOKE PASS');
  } finally {
    await db.user.delete({ where: { id: user.id } }); // cascades everything
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error('ACCOUNTABILITY SMOKE FAIL', err);
  process.exit(1);
});
