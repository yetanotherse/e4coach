import type { PrismaClient } from '@chess-coach/db';
import type { RatingSource } from '@chess-coach/core';

/** How far back a rating backfill reaches (plans/phase-2.md 2.4). One year of
 * day-granular Lichess history is plenty for a "simple progress chart" and
 * keeps first-check-in writes bounded. */
const BACKFILL_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

export interface RatingSourceRef {
  source: 'lichess' | 'chesscom';
  username: string | null;
  provider: RatingSource;
}

/**
 * Persist rating snapshots for every platform username on file (plans/phase-2.md
 * 2.4). Best effort per source: one platform being down or unknown must never
 * fail the caller (the check-in). Lichess history is backfilled (within the
 * window) on first sight; afterwards only newer points are appended. The
 * (userId, source, perf, ratedAt) unique index + skipDuplicates keeps this
 * idempotent under races and repeats.
 */
export async function snapshotRatings(
  db: PrismaClient,
  userId: string,
  sources: readonly RatingSourceRef[],
  now: Date = new Date(),
): Promise<number> {
  let written = 0;
  for (const ref of sources) {
    if (!ref.username) continue;
    try {
      const points = await ref.provider.fetchRatingHistory(ref.username);
      const usable = points.filter((p) => now.getTime() - new Date(p.ratedAt).getTime() <= BACKFILL_WINDOW_MS);
      if (usable.length === 0) continue;

      // Only insert points newer than what we already have for this source.
      const latest = await db.ratingSnapshot.findFirst({
        where: { userId, source: ref.source },
        orderBy: { ratedAt: 'desc' },
        select: { ratedAt: true },
      });
      const fresh = latest ? usable.filter((p) => new Date(p.ratedAt).getTime() > latest.ratedAt.getTime()) : usable;
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
    } catch (err) {
      console.warn(
        `[rating] ${ref.source} snapshot for ${ref.username} unavailable:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return written;
}
