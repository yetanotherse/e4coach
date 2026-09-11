import { describe, it, expect } from 'vitest';
import { LichessRatingSource } from './lichessRatingSource.js';
import { UnknownUserError } from '@chess-coach/core';

/** Shaped like GET /api/user/{u}/rating-history (months are 0-based). */
const HISTORY = [
  { name: 'Blitz', points: [[2026, 6, 6, 1200], [2026, 6, 13, 1215], [2026, 6, 20, 1240]] },
  { name: 'Rapid', points: [[2026, 6, 6, 1350], [2026, 6, 13, 1360]] },
  { name: 'Bullet', points: [[2026, 6, 6, 900]] }, // not tracked — must be dropped
  { name: 'Puzzle', points: [[2026, 6, 6, 2000]] }, // not tracked
];

function source(responses: Array<{ status: number; body: unknown }>): LichessRatingSource {
  let i = 0;
  return new LichessRatingSource({
    userAgent: 'test',
    fetchImpl: (async () => {
      const r = responses[Math.min(i, responses.length - 1)];
      i++;
      return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status });
    }) as typeof fetch,
  });
}

describe('LichessRatingSource', () => {
  it('maps tracked perfs to day-granular UTC points, dropping untracked ones', async () => {
    const points = await source([{ status: 200, body: HISTORY }]).fetchRatingHistory('user');
    expect(points).toHaveLength(5); // 3 blitz + 2 rapid; bullet/puzzle dropped
    expect(points.every((p) => ['blitz', 'rapid'].includes(p.perf))).toBe(true);
    expect(points[0]).toEqual({ perf: 'blitz', rating: 1200, ratedAt: '2026-07-06T00:00:00.000Z' });
    expect(points[3]).toEqual({ perf: 'rapid', rating: 1350, ratedAt: '2026-07-06T00:00:00.000Z' });
  });

  it('throws UnknownUserError on 404', async () => {
    await expect(source([{ status: 404, body: 'not found' }]).fetchRatingHistory('ghost')).rejects.toThrow(
      UnknownUserError,
    );
  });

  it('backs off on 429 then succeeds', async () => {
    const points = await source([
      { status: 429, body: 'slow down' },
      { status: 200, body: HISTORY },
    ]).fetchRatingHistory('user');
    expect(points).toHaveLength(5);
  });

  it('throws on an unexpected shape', async () => {
    await expect(source([{ status: 200, body: { weird: true } }]).fetchRatingHistory('user')).rejects.toThrow(
      /unexpected shape/,
    );
  });
});
