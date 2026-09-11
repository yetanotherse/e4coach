/** RatingSource port (plans/phase-2.md 2.4). Public rating APIs, no auth. */

/** One rating datapoint for a perf (time control) at a moment in time. */
export interface RatingPoint {
  /** 'blitz' | 'rapid' | 'classical' — the perfs we track */
  perf: string;
  rating: number;
  /** ISO timestamp the platform recorded for this rating */
  ratedAt: string;
}

/**
 * Rating history per platform. Lichess exposes a full day-granular history;
 * Chess.com's public API only exposes current stats (a single point per perf),
 * so its history grows from snapshots taken at check-in time.
 */
export interface RatingSource {
  readonly name: string;
  fetchRatingHistory(username: string): Promise<RatingPoint[]>;
}
