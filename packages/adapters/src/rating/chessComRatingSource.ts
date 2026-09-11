import { UnknownUserError, type RatingPoint, type RatingSource } from '@chess-coach/core';
import { ChessComStatsSchema } from './chessComSchema.js';

const BASE = 'https://api.chess.com';

/** Chess.com stat keys → our perf ids. Daily/puzzle stats are not tracked. */
const TRACKED: Array<{ key: 'chess_blitz' | 'chess_rapid'; perf: 'blitz' | 'rapid' }> = [
  { key: 'chess_blitz', perf: 'blitz' },
  { key: 'chess_rapid', perf: 'rapid' },
];

export interface ChessComRatingOptions {
  /** Chess.com requires a descriptive UA with contact info; generic ones get 403. */
  userAgent: string;
  /** injectable for tests; defaults to global fetch */
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  baseUrl?: string;
}

/**
 * RatingSource backed by the Chess.com public stats API (plans/phase-2.md
 * 2.4). Yields the current rating per tracked perf — a single point per call,
 * which the check-in flow appends to the user's snapshot series over time.
 */
export class ChessComRatingSource implements RatingSource {
  readonly name = 'chesscom';
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly baseUrl: string;

  constructor(private readonly opts: ChessComRatingOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxRetries = opts.maxRetries ?? 4;
    this.baseUrl = opts.baseUrl ?? BASE;
  }

  async fetchRatingHistory(username: string): Promise<RatingPoint[]> {
    const url = `${this.baseUrl}/pub/player/${encodeURIComponent(username.toLowerCase())}/stats`;
    const res = await this.getWithBackoff(url);

    if (res.status === 404) throw new UnknownUserError(`Unknown Chess.com user: ${username}`);
    if (!res.ok) throw new Error(`Chess.com responded ${res.status}`);

    const parsed = ChessComStatsSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error('Chess.com stats: unexpected shape');

    const points: RatingPoint[] = [];
    for (const { key, perf } of TRACKED) {
      const last = parsed.data[key]?.last;
      if (!last) continue; // perf never played
      points.push({
        perf,
        rating: last.rating,
        ratedAt: new Date(last.date * 1000).toISOString(),
      });
    }
    return points;
  }

  /** GET with exponential backoff on 429/5xx, honoring Retry-After. */
  private async getWithBackoff(url: string): Promise<Response> {
    let attempt = 0;
    for (;;) {
      const res = await this.fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': this.opts.userAgent },
      });
      if (res.status !== 429 && res.status < 500) return res;
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
