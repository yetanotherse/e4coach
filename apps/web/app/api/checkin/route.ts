import { jsonError, jsonOk, prisma, rateLimit, ratingChessCom, ratingLichess } from '@/lib/server';
import { getSessionUserId } from '@/lib/auth';
import { recordCheckIn } from '@/lib/checkin';
import { snapshotRatings } from '@/lib/ratingSnapshots';

/**
 * POST /api/checkin — the manual weekly check-in (plans/phase-2.md 2.4).
 * A drill solve also records a check-in automatically (see lib/checkin); this
 * route is the explicit path for users who want to mark the week without
 * solving. Idempotent per week: a repeat call is a no-op that reports the
 * existing state. Rating snapshots are taken best-effort for each platform
 * username on file; a rating API being down must never fail the check-in.
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
  const distinctId = user.emailHash ?? userId;
  const checkIn = await recordCheckIn(userId, distinctId, now, 'manual');

  // Rating snapshots (best effort, per platform on file).
  const snapshots = await snapshotRatings(prisma, userId, [
    { source: 'lichess', username: user.lichessUser, provider: ratingLichess },
    { source: 'chesscom', username: user.chessComUser, provider: ratingChessCom },
  ]);

  return jsonOk({
    checkInId: checkIn.checkInId,
    weekStart: checkIn.weekStart.toISOString(),
    alreadyCheckedIn: !checkIn.created,
    currentStreak: checkIn.currentStreak,
    longestStreak: checkIn.longestStreak,
    ratingSnapshotsWritten: snapshots,
  });
}
