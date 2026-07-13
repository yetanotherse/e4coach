import { describe, it, expect, vi } from 'vitest';
import { NoGamesError, UnknownUserError } from '@chess-coach/core';
import { LichessGameSource } from './lichessGameSource.js';

const GAME_RECORD = {
  id: 'abcd1234',
  rated: true,
  variant: 'standard',
  speed: 'blitz',
  perf: 'blitz',
  createdAt: 1_700_000_000_000,
  status: 'mate',
  winner: 'black',
  players: {
    white: { user: { name: 'MockUser' }, rating: 1400 },
    black: { user: { name: 'OpponentA' }, rating: 1420 },
  },
  opening: { eco: 'C50', name: 'Italian Game' },
  clock: { initial: 300, increment: 0 },
  clocks: [30000, 30000, 29000],
  pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5',
};

function ndjsonResponse(records: unknown[], status = 200): Response {
  const body = records.map((r) => JSON.stringify(r)).join('\n');
  return new Response(body, { status, headers: { 'content-type': 'application/x-ndjson' } });
}

function source(fetchImpl: typeof fetch) {
  return new LichessGameSource({ userAgent: 'test/1.0', fetchImpl, maxRetries: 2 });
}

describe('LichessGameSource', () => {
  it('maps an NDJSON record to an ImportedGame with correct user color and result', async () => {
    const fetchImpl = vi.fn(async () => ndjsonResponse([GAME_RECORD])) as unknown as typeof fetch;
    const games = await source(fetchImpl).fetchRecentGames('mockuser', { max: 10 });
    expect(games).toHaveLength(1);
    const g = games[0]!;
    expect(g.id).toBe('abcd1234');
    expect(g.userColor).toBe('white'); // MockUser played white
    expect(g.result).toBe('0-1'); // black won
    expect(g.eco).toBe('C50');
    expect(g.timeControl).toBe('300+0');
    expect(g.clocks).toEqual([30000, 30000, 29000]);
  });

  it('filters out non-standard variants', async () => {
    const chess960 = { ...GAME_RECORD, id: 'x', variant: 'chess960' };
    const fetchImpl = vi.fn(async () =>
      ndjsonResponse([chess960, GAME_RECORD]),
    ) as unknown as typeof fetch;
    const games = await source(fetchImpl).fetchRecentGames('mockuser', { max: 10 });
    expect(games).toHaveLength(1);
  });

  it('clamps to max when Lichess over-returns (its `max` is a floor under filters)', async () => {
    // Lichess rounds `max` up to its 25-game page size when a rated/perfType
    // filter is present (e.g. max=60 → 75). Records are already date-desc, so
    // we must keep the first `max` and drop the surplus.
    const records = Array.from({ length: 75 }, (_, i) => ({
      ...GAME_RECORD,
      id: `game${String(i).padStart(3, '0')}`,
    }));
    const fetchImpl = vi.fn(async () => ndjsonResponse(records)) as unknown as typeof fetch;
    const games = await source(fetchImpl).fetchRecentGames('mockuser', { max: 60 });
    expect(games).toHaveLength(60);
    expect(games[0]!.id).toBe('game000'); // most-recent kept
    expect(games[59]!.id).toBe('game059'); // surplus (game060..game074) dropped
  });

  it('throws UnknownUserError on 404', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    await expect(source(fetchImpl).fetchRecentGames('nobody', { max: 10 })).rejects.toBeInstanceOf(
      UnknownUserError,
    );
  });

  it('throws NoGamesError when the stream is empty', async () => {
    const fetchImpl = vi.fn(async () => ndjsonResponse([])) as unknown as typeof fetch;
    await expect(source(fetchImpl).fetchRecentGames('mockuser', { max: 10 })).rejects.toBeInstanceOf(
      NoGamesError,
    );
  });

  it('retries on 429 then succeeds', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls === 1) return new Response('', { status: 429, headers: { 'retry-after': '0' } });
      return ndjsonResponse([GAME_RECORD]);
    }) as unknown as typeof fetch;
    const games = await source(fetchImpl).fetchRecentGames('mockuser', { max: 10 });
    expect(calls).toBe(2);
    expect(games).toHaveLength(1);
  });
});
