import type { PrismaClient } from '@chess-coach/db';
import type { RatingSource } from '@chess-coach/core';

/** Upper bound on points backfilled per source — same intent as the old 365-day
 * window, but as a count: a single-point "current rating" (Chess.com's shape)
 * must never be dropped just because the user's last rated game is old. */
const MAX_POINTS_PER_SOURCE = 365;

export interface RatingSourceRef {
  source: 'lichess' | 'chesscom';
  username: string | null;
  provider: RatingSource;
}

/**
 * Persist rating snapshots for every platform username on file (plans/phase-2.md
 * 2.4). Best effort per source: one platform being down or unknown must never
 * fail the caller (the check-in). History is backfilled (within the point cap)
 * on first sight; afterwards only newer points are appended. The
 * (userId, source, perf, ratedAt) unique index + skipDuplicates keeps this
 * idempotent under races and repeats.
 */
export async function snapshotRatings(
  db: PrismaClient,
  userId: string,
  sources: readonly RatingSourceRef[],
): Promise<number> {
  let written = 0;
  for (const ref of sources) {
    if (!ref.username) continue;
    try {
      const points = await ref.provider.fetchRatingHistory(ref.username);
      // Newest first, bounded — so backfills stay small without excluding
      // "current rating" points that happen to carry an old ratedAt date.
      const usable = points
        .sort((a, b) => new Date(b.ratedAt).getTime() - new Date(a.ratedAt).getTime())
        .slice(0, MAX_POINTS_PER_SOURCE);
      if (usable.length === 0) continue;

      // Only insert points newer than what we already have — and the watermark
      // must be per (source, perf): Lichess history is day-granular and every
      // perf shares dates, so a per-source watermark would suppress same-day
      // points of the other perfs forever.
      const byPerf = new Map<string, typeof points>();
      for (const p of usable) {
        const arr = byPerf.get(p.perf) ?? [];
        arr.push(p);
        byPerf.set(p.perf, arr);
      }
      for (const [perf, pts] of byPerf) {
        const latest = await db.ratingSnapshot.findFirst({
          where: { userId, source: ref.source, perf },
          orderBy: { ratedAt: 'desc' },
          select: { ratedAt: true },
        });
        const fresh = latest ? pts.filter((p) => new Date(p.ratedAt).getTime() > latest.ratedAt.getTime()) : pts;
        if (fresh.length === 0) continue;

        const res = await db.ratingSnapshot.createMany({
          data: fresh.map((p) => ({
            userId,
            source: ref.source,
            perf: p.perf,
            rating: p.rating,
            ratedAt: new Date(p.ratedAt),
          })),
          skipDuplicates: true,
        });
        written += res.count;
      }
    } catch (err) {
      console.warn(
        `[rating] ${ref.source} snapshot for ${ref.username} unavailable:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return written;
}
