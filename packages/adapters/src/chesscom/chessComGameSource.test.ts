import { describe, it, expect, vi } from 'vitest';
import { NoGamesError, UnknownUserError } from '@chess-coach/core';
import { ChessComGameSource, parseClocksCs } from './chessComGameSource.js';

const GAME = {
  url: 'https://www.chess.com/game/live/100978445235',
  pgn:
    '[Event "Live Chess"]\n[White "MockUser"]\n[Black "OpponentA"]\n[Result "0-1"]\n[ECO "C61"]\n' +
    '1. e4 {[%clk 0:09:57.5]} 1... e5 {[%clk 0:09:57]} 2. Nf3 {[%clk 0:09:52.6]} 2... Nc6 {[%clk 0:09:54.9]}',
  time_control: '600',
  end_time: 1707240205,
  rated: true,
  time_class: 'rapid',
  rules: 'chess',
  white: { username: 'MockUser', rating: 1400, result: 'resigned' },
  black: { username: 'OpponentA', rating: 1420, result: 'win' },
  eco: 'https://www.chess.com/openings/Ruy-Lopez',
};

interface Route {
  status: number;
  body: unknown;
}

/** Fetch stub keyed by path (without the api.chess.com prefix). */
function source(routes: Record<string, Route>, opts = {}): ChessComGameSource {
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    const key = String(url).replace('https://api.chess.com', '');
    const hit = routes[key];
    if (!hit) return new Response('', { status: 404 });
    return new Response(JSON.stringify(hit.body), {
      status: hit.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return new ChessComGameSource({ userAgent: 'test/1.0', fetchImpl, maxRetries: 2, ...opts });
}

describe('ChessComGameSource', () => {
  const ARCHIVES: Record<string, Route> = {
    '/pub/player/mockuser/games/archives': {
      status: 200,
      // Deliberately unsorted (matches the real API) — adapter must sort newest-first.
      body: {
        archives: [
          'https://api.chess.com/pub/player/mockuser/games/2023/05',
          'https://api.chess.com/pub/player/mockuser/games/2024/02',
        ],
      },
    },
    '/pub/player/mockuser/games/2024/02': { status: 200, body: { games: [GAME] } },
    '/pub/player/mockuser/games/2023/05': { status: 200, body: { games: [] } },
  };

  it('maps a game record to an ImportedGame with correct user color, result, clocks', async () => {
    const games = await source(ARCHIVES).fetchRecentGames('mockuser', { max: 10 });
    expect(games).toHaveLength(1);
    const g = games[0]!;
    expect(g.id).toBe('100978445235');
    expect(g.userColor).toBe('white'); // MockUser played white
    expect(g.result).toBe('0-1'); // black won by white resigning
    expect(g.eco).toBe('C61'); // from the PGN tag, not the eco URL
    expect(g.timeControl).toBe('600+0');
    expect(g.speed).toBe('rapid');
    expect(g.playedAt).toBe(new Date(1707240205 * 1000).toISOString());
    // 9:57.5 → 59750 cs; 9:57 → 59700 cs
    expect(g.clocks).toEqual([59750, 59700, 59260, 59490]);
  });

  it('iterates archives newest-first and stops at max', async () => {
    const older = { ...GAME, url: 'https://www.chess.com/game/live/111', end_time: 1600000000 };
    const routes: Record<string, Route> = {
      '/pub/player/mockuser/games/archives': {
        status: 200,
        body: {
          archives: [
            'https://api.chess.com/pub/player/mockuser/games/2023/05',
            'https://api.chess.com/pub/player/mockuser/games/2024/02',
          ],
        },
      },
      '/pub/player/mockuser/games/2024/02': { status: 200, body: { games: [GAME] } },
      '/pub/player/mockuser/games/2023/05': { status: 200, body: { games: [older] } },
    };
    const games = await source(routes).fetchRecentGames('mockuser', { max: 2 });
    expect(games.map((g) => g.id)).toEqual(['100978445235', '111']);
  });

  it('filters variants, unrated, and non-matching time classes', async () => {
    const chess960 = { ...GAME, rules: 'chess960', url: 'https://www.chess.com/game/live/1' };
    const unrated = { ...GAME, rated: false, url: 'https://www.chess.com/game/live/2' };
    const bullet = { ...GAME, time_class: 'bullet', url: 'https://www.chess.com/game/live/3' };
    const routes: Record<string, Route> = {
      '/pub/player/mockuser/games/archives': {
        status: 200,
        body: { archives: ['https://api.chess.com/pub/player/mockuser/games/2024/02'] },
      },
      '/pub/player/mockuser/games/2024/02': {
        status: 200,
        body: { games: [chess960, unrated, bullet, GAME] },
      },
    };
    const games = await source(routes).fetchRecentGames('mockuser', {
      max: 10,
      rated: true,
      perfTypes: ['rapid'],
    });
    expect(games).toHaveLength(1);
  });

  it('throws UnknownUserError on 404 from the archives endpoint', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    const s = new ChessComGameSource({ userAgent: 't', fetchImpl });
    await expect(s.fetchRecentGames('nobody', { max: 10 })).rejects.toBeInstanceOf(UnknownUserError);
  });

  it('throws NoGamesError when all archives are empty', async () => {
    const routes: Record<string, Route> = {
      '/pub/player/mockuser/games/archives': {
        status: 200,
        body: { archives: ['https://api.chess.com/pub/player/mockuser/games/2024/02'] },
      },
      '/pub/player/mockuser/games/2024/02': { status: 200, body: { games: [] } },
    };
    await expect(source(routes).fetchRecentGames('mockuser', { max: 10 })).rejects.toBeInstanceOf(
      NoGamesError,
    );
  });

  it('retries on 429 then succeeds', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      calls++;
      if (calls === 1 && String(url).endsWith('/archives')) {
        return new Response('', { status: 429, headers: { 'retry-after': '0' } });
      }
      if (String(url).endsWith('/archives')) {
        return Response.json({
          archives: ['https://api.chess.com/pub/player/mockuser/games/2024/02'],
        });
      }
      return Response.json({ games: [GAME] });
    }) as unknown as typeof fetch;
    const s = new ChessComGameSource({ userAgent: 't', fetchImpl, maxRetries: 2 });
    const games = await s.fetchRecentGames('mockuser', { max: 10 });
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(games).toHaveLength(1);
  });

  it('skips games where the user is not a participant', async () => {
    const spectator = {
      ...GAME,
      url: 'https://www.chess.com/game/live/9',
      white: { ...GAME.white, username: 'SomeoneElse' },
    };
    const routes: Record<string, Route> = {
      '/pub/player/mockuser/games/archives': {
        status: 200,
        body: { archives: ['https://api.chess.com/pub/player/mockuser/games/2024/02'] },
      },
      '/pub/player/mockuser/games/2024/02': { status: 200, body: { games: [spectator] } },
    };
    await expect(source(routes).fetchRecentGames('mockuser', { max: 10 })).rejects.toBeInstanceOf(
      NoGamesError,
    );
  });

  it('parses [%clk] comments to centiseconds and reports undefined when absent', () => {
    expect(parseClocksCs('1. e4 {[%clk 0:01:00]} 1... e5 {[%clk 0:00:05.25]}')).toEqual([
      6000, 525,
    ]);
    expect(parseClocksCs('1. e4 e5')).toBeUndefined();
  });
});
