import { nextStreakState, weekStartFor } from '@chess-coach/core';
import { analytics, jsonError, jsonOk, prisma, rateLimit, ratingChessCom, ratingLichess } from '@/lib/server';
import { getSessionUserId } from '@/lib/auth';
import { snapshotRatings } from '@/lib/ratingSnapshots';

/**
 * POST /api/checkin — the weekly check-in (plans/phase-2.md 2.4). Idempotent
 * per week: a repeat call is a no-op that reports the existing state. Rating
 * snapshots are taken best-effort for each platform username on file; a rating
 * API being down must never fail the check-in itself.
 */
export async function POST(req: Request): Promise<Response> {
  const userId = getSessionUserId();
  if (!userId) return jsonError('Not signed in', 401);
  if (!(await rateLimit(req, 'track'))) return jsonError('Too many requests', 429);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailHash: true, lichessUser: true, chessComUser: true },
  });
  if (!user) return jsonError('Session expired', 401);

  const now = new Date();
  const weekStart = weekStartFor(now);

  // Idempotent per week: create if absent, no-op update otherwise.
  const checkIn = await prisma.checkIn.upsert({
    where: { userId_weekStart: { userId, weekStart } },
    create: { userId, weekStart },
    update: {},
  });

  // Streak: only advances on the first check-in of the week.
  const streakBefore = await prisma.streak.findUnique({ where: { userId } });
  const next = nextStreakState(
    {
      currentStreak: streakBefore?.currentStreak ?? 0,
      longestStreak: streakBefore?.longestStreak ?? 0,
      lastCheckInWeekStart: streakBefore?.lastCheckInWeekStart ?? null,
    },
    weekStart,
  );
  const isNewCheckIn = streakBefore?.lastCheckInWeekStart?.getTime() !== weekStart.getTime();
  const streak = await prisma.streak.upsert({
    where: { userId },
    create: {
      userId,
      currentStreak: next.currentStreak,
      longestStreak: next.longestStreak,
      lastCheckInWeekStart: next.lastCheckInWeekStart,
    },
    update: {
      currentStreak: next.currentStreak,
      longestStreak: next.longestStreak,
      lastCheckInWeekStart: next.lastCheckInWeekStart,
    },
  });

  // Rating snapshots (best effort, per platform on file).
  const snapshots = await snapshotRatings(prisma, userId, [
    { source: 'lichess', username: user.lichessUser, provider: ratingLichess },
    { source: 'chesscom', username: user.chessComUser, provider: ratingChessCom },
  ]);

  const distinctId = user.emailHash ?? userId;
  if (isNewCheckIn) {
    await analytics.capture(distinctId, 'checkin_done', {
      weekStart: weekStart.toISOString(),
      currentStreak: streak.currentStreak,
    });
    if (streak.currentStreak > (streakBefore?.currentStreak ?? 0)) {
      await analytics.capture(distinctId, 'streak_extended', {
        weekStart: weekStart.toISOString(),
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
      });
    }
  }

  return jsonOk({
    checkInId: checkIn.id,
    weekStart: weekStart.toISOString(),
    alreadyCheckedIn: !isNewCheckIn,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    ratingSnapshotsWritten: snapshots,
  });
}
