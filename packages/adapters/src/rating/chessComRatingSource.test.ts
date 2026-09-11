import { describe, it, expect } from 'vitest';
import { ChessComRatingSource } from './chessComRatingSource.js';
import { UnknownUserError } from '@chess-coach/core';

/** Shaped like GET /pub/player/{u}/stats (subset; passthrough keeps the rest). */
const STATS = {
  chess_blitz: { last: { rating: 1420, date: 1759104000, rd: 55 }, best: { rating: 1500, date: 1758000000 } },
  chess_rapid: { last: { rating: 1550, date: 1759104000, rd: 60 } },
  chess_daily: { last: { rating: 1300, date: 1759104000, rd: 70 } }, // not tracked
  fide: 1600,
};

function source(responses: Array<{ status: number; body: unknown }>): ChessComRatingSource {
  let i = 0;
  return new ChessComRatingSource({
    userAgent: 'test',
    fetchImpl: (async () => {
      const r = responses[Math.min(i, responses.length - 1)];
      i++;
      return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status });
    }) as typeof fetch,
  });
}

describe('ChessComRatingSource', () => {
  it('yields the current rating for tracked perfs only', async () => {
    const points = await source([{ status: 200, body: STATS }]).fetchRatingHistory('User');
    expect(points).toHaveLength(2); // blitz + rapid; daily dropped
    expect(points[0]).toEqual({ perf: 'blitz', rating: 1420, ratedAt: new Date(1759104000 * 1000).toISOString() });
    expect(points[1]!.perf).toBe('rapid');
  });

  it('skips perfs the player has never played', async () => {
    const points = await source([{ status: 200, body: { chess_blitz: STATS.chess_blitz } }]).fetchRatingHistory('user');
    expect(points).toHaveLength(1);
    expect(points[0]!.perf).toBe('blitz');
  });

  it('throws UnknownUserError on 404', async () => {
    await expect(source([{ status: 404, body: 'not found' }]).fetchRatingHistory('ghost')).rejects.toThrow(
      UnknownUserError,
    );
  });

  it('backs off on 500 then succeeds', async () => {
    const points = await source([
      { status: 500, body: 'oops' },
      { status: 200, body: STATS },
    ]).fetchRatingHistory('user');
    expect(points).toHaveLength(2);
  });
});
