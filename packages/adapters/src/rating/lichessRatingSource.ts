import { UnknownUserError, type RatingPoint, type RatingSource } from '@chess-coach/core';
import { LichessRatingHistorySchema } from './lichessSchema.js';

const BASE = 'https://lichess.org';

/** The perfs we track (matches the game-source defaults); others are ignored. */
const TRACKED = new Set(['Blitz', 'Rapid', 'Classical']);
const PERF_ID = (name: string) => name.toLowerCase();

export interface LichessRatingOptions {
  userAgent: string;
  /** injectable for tests; defaults to global fetch */
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  baseUrl?: string;
}

/**
 * RatingSource backed by Lichess's public rating history (plans/phase-2.md
 * 2.4): one day-granular series per perf. No auth needed for public profiles.
 */
export class LichessRatingSource implements RatingSource {
  readonly name = 'lichess';
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly baseUrl: string;

  constructor(private readonly opts: LichessRatingOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxRetries = opts.maxRetries ?? 4;
    this.baseUrl = opts.baseUrl ?? BASE;
  }

  async fetchRatingHistory(username: string): Promise<RatingPoint[]> {
    const url = `${this.baseUrl}/api/user/${encodeURIComponent(username)}/rating-history`;
    const res = await this.getWithBackoff(url);

    if (res.status === 404) throw new UnknownUserError(`Unknown Lichess user: ${username}`);
    if (!res.ok) throw new Error(`Lichess responded ${res.status}`);

    const parsed = LichessRatingHistorySchema.safeParse(await res.json());
    if (!parsed.success) throw new Error('Lichess rating history: unexpected shape');

    const points: RatingPoint[] = [];
    for (const perf of parsed.data) {
      if (!TRACKED.has(perf.name)) continue;
      for (const [year, month, day, rating] of perf.points) {
        // Lichess months are 0-based; day-of-month is 1-based.
        points.push({
          perf: PERF_ID(perf.name),
          rating,
          ratedAt: new Date(Date.UTC(year, month, day)).toISOString(),
        });
      }
    }
    return points;
  }

  /** GET with exponential backoff on 429/503, honoring Retry-After. */
  private async getWithBackoff(url: string): Promise<Response> {
    let attempt = 0;
    for (;;) {
      const res = await this.fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': this.opts.userAgent },
      });
      if (res.status !== 429 && res.status !== 503) return res;
      if (attempt >= this.maxRetries) return res;
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(60_000, 1000 * 2 ** attempt) + Math.random() * 500;
      await sleep(waitMs);
      attempt++;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
