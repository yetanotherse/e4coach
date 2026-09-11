/**
 * DB-backed fixed-window rate limiting (plans/phase-2.md 2.0.5). One atomic
 * upsert per check: a new window starts a fresh count, an existing window
 * increments. Buckets are keyed per route+IP. Fails OPEN on DB errors — a
 * limiter outage must never block real users.
 */
import type { PrismaClient } from '@chess-coach/db';

/** Window start (epoch ms) for a fixed window of `windowMs` ending at `now`. */
export function windowStartFor(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

/** Decision for a count observed in the current window: allowed while count <= limit. */
export function isAllowed(count: number, limit: number): boolean {
  return count <= limit;
}

/**
 * Check and consume one unit from the bucket. Returns true when the request is
 * allowed (i.e. the bucket count after this request is within `limit`).
 */
export async function checkRateLimit(
  prisma: PrismaClient,
  bucket: string,
  limit: number,
  windowMs = 60_000,
): Promise<boolean> {
  const windowStart = windowStartFor(Date.now(), windowMs);
  const iso = new Date(windowStart).toISOString();
  try {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "RateLimitBucket" ("bucket", "windowStart", "count")
      VALUES (${bucket}, CAST(${iso} AS TIMESTAMP(3)), 1)
      ON CONFLICT ("bucket") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."windowStart" < CAST(${iso} AS TIMESTAMP(3))
                       THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "windowStart" = CASE WHEN "RateLimitBucket"."windowStart" < CAST(${iso} AS TIMESTAMP(3))
                             THEN CAST(${iso} AS TIMESTAMP(3)) ELSE "RateLimitBucket"."windowStart" END
      RETURNING "count"`;
    const count = Number(rows[0]?.count ?? 1);
    return isAllowed(count, limit);
  } catch (err) {
    console.warn(`[rate-limit] failed open for ${bucket}:`, err);
    return true;
  }
}

/** First public IP from x-forwarded-for (Vercel/proxies), else a shared bucket. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  const first = fwd?.split(',')[0]?.trim();
  return first || 'unknown';
}
