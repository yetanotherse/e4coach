import type { RatingPoint, RatingSource } from '@chess-coach/core';

/**
 * Deterministic rating source for tests + dev (mock env). A gentle rising
 * blitz/rapid series anchored to fixed dates so charts and streak flows have
 * something stable to render.
 */
export class MockRatingSource implements RatingSource {
  readonly name = 'mock';

  async fetchRatingHistory(username: string): Promise<RatingPoint[]> {
    void username;
    const series: Array<{ perf: string; start: number; step: number; weeks: number }> = [
      { perf: 'blitz', start: 1200, step: 15, weeks: 8 },
      { perf: 'rapid', start: 1350, step: 10, weeks: 6 },
    ];
    const out: RatingPoint[] = [];
    for (const s of series) {
      for (let i = 0; i < s.weeks; i++) {
        out.push({
          perf: s.perf,
          rating: s.start + s.step * i,
          ratedAt: new Date(Date.UTC(2026, 6, 6 + i * 7)).toISOString(), // Mondays
        });
      }
    }
    return out;
  }
}
