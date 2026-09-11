import { z } from 'zod';
import { dueAtFor, isDue, nextSrsState } from '@chess-coach/core';
import { analytics, jsonError, jsonOk, prisma, ratingChessCom, ratingLichess } from '@/lib/server';
import { getSessionUserId } from '@/lib/auth';
import { recordCheckIn } from '@/lib/checkin';
import { snapshotRatings } from '@/lib/ratingSnapshots';

const AttemptSchema = z.object({
  solved: z.boolean(),
  playedUci: z.string().min(4).max(5).optional(),
  timeSpentMs: z.coerce.number().int().positive().max(3_600_000).optional(),
});

/**
 * POST /api/drills/:id/attempt — record one solve attempt (plans/phase-2.md
 * 2.2a). The drill must belong to the signed-in user; the session provides the
 * user, never the body.
 *
 * A successful attempt also advances the drill's SM-2-lite schedule
 * (plans/phase-2.md 2.3): failed tries since the last review count as lapses,
 * so a clean solve extends the interval and a grind-out solve resets it. A
 * solve of a due drill additionally emits `review_completed`.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const userId = getSessionUserId();
  if (!userId) return jsonError('Not signed in', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }
  const parsed = AttemptSchema.safeParse(body);
  if (!parsed.success) return jsonError('Invalid attempt data', 422);

  const drill = await prisma.drill.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      userId: true,
      theme: true,
      intervalDays: true,
      ease: true,
      reviewCount: true,
      dueAt: true,
      lastReviewedAt: true,
    },
  });
  if (!drill || drill.userId !== userId) return jsonError('Drill not found', 404);

  const { solved, playedUci, timeSpentMs } = parsed.data;
  await prisma.drillAttempt.create({
    data: {
      drillId: drill.id,
      userId,
      solved,
      ...(playedUci ? { playedUci } : {}),
      ...(timeSpentMs ? { timeSpentMs } : {}),
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailHash: true, lichessUser: true, chessComUser: true },
  });
  const distinctId = user?.emailHash ?? userId;
  await analytics.capture(distinctId, solved ? 'drill_solved' : 'drill_attempted', {
    drillId: drill.id,
    theme: drill.theme,
    ...(playedUci ? { playedUci } : {}),
    ...(timeSpentMs ? { timeSpentMs } : {}),
  });

  if (solved) {
    // First solve of the week checks the user in automatically — the manual
    // button and drill solves share one idempotent path (lib/checkin), so the
    // streak advances exactly once per week.
    const checkIn = await recordCheckIn(userId, distinctId, new Date(), 'drill');
    if (checkIn.created) {
      void snapshotRatings(prisma, userId, [
        { source: 'lichess', username: user?.lichessUser ?? null, provider: ratingLichess },
        { source: 'chesscom', username: user?.chessComUser ?? null, provider: ratingChessCom },
      ]);
    }

    const wasDue = isDue(drill.dueAt, new Date());
    const lapses = await prisma.drillAttempt.count({
      where: {
        drillId: drill.id,
        solved: false,
        ...(drill.lastReviewedAt ? { createdAt: { gt: drill.lastReviewedAt } } : {}),
      },
    });
    const srs = nextSrsState(
      { intervalDays: drill.intervalDays, ease: drill.ease, reviewCount: drill.reviewCount },
      { lapses },
    );
    const now = new Date();
    await prisma.drill.update({
      where: { id: drill.id },
      data: {
        intervalDays: srs.intervalDays,
        ease: srs.ease,
        reviewCount: srs.reviewCount,
        dueAt: dueAtFor(now, srs.intervalDays),
        lastReviewedAt: now,
      },
    });
    if (wasDue) {
      await analytics.capture(distinctId, 'review_completed', {
        drillId: drill.id,
        theme: drill.theme,
        lapses,
        nextIntervalDays: srs.intervalDays,
        reviewCount: srs.reviewCount,
      });
    }
  }

  return jsonOk({ recorded: true }, 201);
}
