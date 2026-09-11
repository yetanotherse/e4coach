import { nextStreakState, weekStartFor } from '@chess-coach/core';
import { Prisma } from '@chess-coach/db';
import { analytics, prisma } from './server';

export type CheckInSource = 'manual' | 'drill';

export interface CheckInResult {
  /** false when a check-in already existed for this week (or was just created concurrently) */
  created: boolean;
  checkInId: string | null;
  weekStart: Date;
  currentStreak: number;
  longestStreak: number;
}

/**
 * Record this week's check-in for the user (plans/phase-2.md 2.4, with the
 * auto check-in extension: the first drill solve of a week checks in too).
 *
 * Idempotent per (userId, weekStart). The create is the serialization point:
 * only the caller whose insert wins the unique constraint advances the streak,
 * so concurrent manual + auto check-ins can never double-increment. Rating
 * snapshots are NOT taken here — callers decide whether to await them
 * (manual) or fire-and-forget (drill solve).
 */
export async function recordCheckIn(
  userId: string,
  distinctId: string,
  now: Date,
  source: CheckInSource,
): Promise<CheckInResult> {
  const weekStart = weekStartFor(now);

  const existing = await prisma.checkIn.findUnique({
    where: { userId_weekStart: { userId, weekStart } },
    select: { id: true },
  });
  if (existing) {
    const streak = await prisma.streak.findUnique({ where: { userId } });
    return {
      created: false,
      checkInId: existing.id,
      weekStart,
      currentStreak: streak?.currentStreak ?? 0,
      longestStreak: streak?.longestStreak ?? 0,
    };
  }

  let checkInId: string;
  try {
    const created = await prisma.checkIn.create({ data: { userId, weekStart } });
    checkInId = created.id;
  } catch (err) {
    // Lost a concurrent race; the winner advances the streak.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const streak = await prisma.streak.findUnique({ where: { userId } });
      return {
        created: false,
        checkInId: null,
        weekStart,
        currentStreak: streak?.currentStreak ?? 0,
        longestStreak: streak?.longestStreak ?? 0,
      };
    }
    throw err;
  }

  const streakBefore = await prisma.streak.findUnique({ where: { userId } });
  const next = nextStreakState(
    {
      currentStreak: streakBefore?.currentStreak ?? 0,
      longestStreak: streakBefore?.longestStreak ?? 0,
      lastCheckInWeekStart: streakBefore?.lastCheckInWeekStart ?? null,
    },
    weekStart,
  );
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

  await analytics.capture(distinctId, 'checkin_done', {
    weekStart: weekStart.toISOString(),
    currentStreak: streak.currentStreak,
    source,
  });
  if (streak.currentStreak > (streakBefore?.currentStreak ?? 0)) {
    await analytics.capture(distinctId, 'streak_extended', {
      weekStart: weekStart.toISOString(),
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      source,
    });
  }

  return {
    created: true,
    checkInId,
    weekStart,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
  };
}
