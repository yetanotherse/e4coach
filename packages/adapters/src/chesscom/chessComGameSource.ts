import {
  NoGamesError,
  UnknownUserError,
  type FetchGamesOptions,
  type GameSource,
  type ImportedGame,
  type Color,
} from '@chess-coach/core';
import {
  ChessComGameSchema,
  ChessComArchiveSchema,
  ChessComArchivesSchema,
  type ChessComGame,
} from './schema.js';

const BASE = 'https://api.chess.com';

/** Chess.com result codes that mean the game was drawn. */
const DRAW_RESULTS = new Set([
  'agreed',
  'repetition',
  'stalemate',
  'insufficient',
  '50move',
  'timevsinsufficient',
]);

export interface ChessComOptions {
  /** Chess.com requires a descriptive UA with contact info; generic ones get 403. */
  userAgent: string;
  /** injectable for tests; defaults to global fetch */
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  baseUrl?: string;
}

/**
 * GameSource backed by the Chess.com public API (plans/phase-2.md 2.1). Monthly
 * archives: list them, walk newest→oldest, and stop once `max` usable games are
 * collected. Filters to standard chess (+ rated/perfType when given), maps to
 * the domain ImportedGame, and backs off on 429/5xx.
 */
export class ChessComGameSource implements GameSource {
  readonly name = 'chesscom';
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly baseUrl: string;

  constructor(private readonly opts: ChessComOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxRetries = opts.maxRetries ?? 4;
    this.baseUrl = opts.baseUrl ?? BASE;
  }

  async fetchRecentGames(username: string, opts: FetchGamesOptions): Promise<ImportedGame[]> {
    const archives = await this.archives(username);
    const games: ImportedGame[] = [];

    for (const url of archives) {
      if (games.length >= opts.max) break;
      const archive = await this.getWithBackoff(url);
      if (!archive.ok) continue; // one dead archive must not kill the batch
      const parsed = ChessComArchiveSchema.safeParse(await archive.json());
      if (!parsed.success) continue;
      for (const raw of parsed.data.games) {
        const record = ChessComGameSchema.safeParse(raw);
        if (!record.success) continue;
        const mapped = this.toImportedGame(record.data, username, opts);
        if (mapped) games.push(mapped);
        if (games.length >= opts.max) break;
      }
    }

    if (games.length === 0) throw new NoGamesError(`No standard public games for ${username}`);
    return games;
  }

  /** Monthly archive URLs, newest first (the API returns them unsorted). */
  private async archives(username: string): Promise<string[]> {
    const res = await this.getWithBackoff(
      `${this.baseUrl}/pub/player/${encodeURIComponent(username)}/games/archives`,
    );
    if (res.status === 404) throw new UnknownUserError(`Unknown Chess.com user: ${username}`);
    if (!res.ok) throw new Error(`Chess.com responded ${res.status}`);
    const parsed = ChessComArchivesSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error('Chess.com archives response malformed');
    return parsed.data.archives.sort().reverse();
  }

  /** GET with exponential backoff on 429/5xx, honoring Retry-After. */
  private async getWithBackoff(url: string): Promise<Response> {
    let attempt = 0;
    for (;;) {
      const res = await this.fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': this.opts.userAgent },
      });
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt >= this.maxRetries) return res;
        const retryAfter = Number(res.headers.get('retry-after'));
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : Math.min(60_000, 1000 * 2 ** attempt) + Math.random() * 500;
        await sleep(waitMs);
        attempt++;
        continue;
      }
      return res;
    }
  }

  private toImportedGame(
    g: ChessComGame,
    username: string,
    opts: FetchGamesOptions,
  ): ImportedGame | null {
    if (!g.pgn) return null; // need the PGN to analyze
    if (g.rules !== undefined && g.rules !== 'chess') return null; // variants out of scope
    if (opts.rated !== undefined && g.rated !== opts.rated) return null;
    if (opts.perfTypes?.length && (!g.time_class || !opts.perfTypes.includes(g.time_class))) {
      return null;
    }

    const lower = username.toLowerCase();
    const whiteName = g.white.username.toLowerCase();
    const blackName = g.black.username.toLowerCase();
    const userColor: Color | null =
      whiteName === lower ? 'white' : blackName === lower ? 'black' : null;
    if (!userColor) return null; // couldn't identify the user's side

    const result =
      g.white.result === 'win'
        ? '1-0'
        : g.black.result === 'win'
          ? '0-1'
          : DRAW_RESULTS.has(g.white.result ?? '') || DRAW_RESULTS.has(g.black.result ?? '')
            ? '1/2-1/2'
            : // any other result code is a loss for that side; pick the winner
              whiteWinnerFromLoss(g.white.result, g.black.result);

    return {
      id: gameId(g),
      pgn: g.pgn,
      white: g.white.username,
      black: g.black.username,
      userColor,
      result,
      timeControl: timeControl(g),
      ...(g.time_class ? { speed: g.time_class } : {}),
      ...(pgnEco(g.pgn) ? { eco: pgnEco(g.pgn) } : {}),
      ...(parseClocksCs(g.pgn) ? { clocks: parseClocksCs(g.pgn) } : {}),
      playedAt: g.end_time
        ? new Date(g.end_time * 1000).toISOString()
        : new Date().toISOString(),
    };
  }
}

/** Map any loss-type result code to a winner ('1-0' default if unreadable). */
function whiteWinnerFromLoss(whiteResult?: string, blackResult?: string): string {
  const whiteLost = whiteResult && !DRAW_RESULTS.has(whiteResult) && whiteResult !== 'win';
  const blackLost = blackResult && !DRAW_RESULTS.has(blackResult) && blackResult !== 'win';
  if (whiteLost && !blackLost) return '0-1';
  return '1-0';
}

/** Live-game id from the URL; fallback to uuid-ish path segments. */
function gameId(g: ChessComGame): string {
  const live = g.url.match(/live\/(\d+)/)?.[1];
  if (live) return live;
  const daily = g.url.match(/daily\/(\d+)/)?.[1];
  if (daily) return daily;
  return g.url.split('/').filter(Boolean).pop() ?? g.url;
}

/** ECO code from the PGN's [ECO] tag (chess.com's `eco` field is a URL). */
function pgnEco(pgn: string): string | undefined {
  return pgn.match(/\[ECO "([A-E]\d{2})"\]/)?.[1];
}

/** time_control "600" → "600+0"; "600+2" → "600+2"; daily/unbounded → time_class. */
function timeControl(g: ChessComGame): string {
  const tc = g.time_control;
  if (!tc || tc === '-' || tc.includes('/')) return g.time_class ?? 'unknown';
  const [initial, increment] = tc.split('+');
  return `${initial}+${increment ?? '0'}`;
}

/**
 * Per-move remaining clock, parsed from the PGN's [%clk h:mm:ss(.t)] comments,
 * converted to centiseconds (the domain's clock unit). Absent → undefined.
 */
export function parseClocksCs(pgn: string): number[] | undefined {
  const out: number[] = [];
  for (const m of pgn.matchAll(/\[%clk\s+(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d+))?\]/g)) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    const s = Number(m[3]);
    const frac = m[4] ? Number(`0.${m[4]}`) : 0;
    out.push(Math.round((h * 3600 + min * 60 + s + frac) * 100));
  }
  return out.length > 0 ? out : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
