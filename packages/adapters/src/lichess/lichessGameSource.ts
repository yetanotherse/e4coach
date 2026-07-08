import {
  NoGamesError,
  UnknownUserError,
  type FetchGamesOptions,
  type GameSource,
  type ImportedGame,
  type Color,
} from '@chess-coach/core';
import { LichessGameSchema, type LichessGame } from './schema.js';

const BASE = 'https://lichess.org';
const DEFAULT_PERFS = ['blitz', 'rapid', 'classical'];

export interface LichessOptions {
  userAgent: string;
  /** injectable for tests; defaults to global fetch */
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  baseUrl?: string;
}

/**
 * GameSource backed by the Lichess public games export (spec §7.1). No OAuth
 * needed for public games. Streams NDJSON, filters to standard chess, maps to
 * the domain ImportedGame, and backs off on 429.
 */
export class LichessGameSource implements GameSource {
  readonly name = 'lichess';
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly baseUrl: string;

  constructor(private readonly opts: LichessOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxRetries = opts.maxRetries ?? 4;
    this.baseUrl = opts.baseUrl ?? BASE;
  }

  async fetchRecentGames(username: string, opts: FetchGamesOptions): Promise<ImportedGame[]> {
    const params = new URLSearchParams({
      max: String(opts.max),
      pgnInJson: 'true',
      clocks: 'true',
      opening: 'true',
      sort: 'dateDesc',
    });
    if (opts.rated !== undefined) params.set('rated', String(opts.rated));
    params.set('perfType', (opts.perfTypes ?? DEFAULT_PERFS).join(','));

    const url = `${this.baseUrl}/api/games/user/${encodeURIComponent(username)}?${params}`;
    const res = await this.getWithBackoff(url);

    if (res.status === 404) throw new UnknownUserError(`Unknown Lichess user: ${username}`);
    if (!res.ok) throw new Error(`Lichess responded ${res.status}`);

    const text = await res.text();
    const games = this.parseNdjson(text)
      .filter((g) => (g.variant ?? 'standard') === 'standard')
      .map((g) => this.toImportedGame(g, username))
      .filter((g): g is ImportedGame => g !== null);

    if (games.length === 0) throw new NoGamesError(`No standard public games for ${username}`);
    return games;
  }

  /** GET with exponential backoff on 429/503, honoring Retry-After. */
  private async getWithBackoff(url: string): Promise<Response> {
    let attempt = 0;
    for (;;) {
      const res = await this.fetchImpl(url, {
        headers: { Accept: 'application/x-ndjson', 'User-Agent': this.opts.userAgent },
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

  private parseNdjson(text: string): LichessGame[] {
    const out: LichessGame[] = [];
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parsed = LichessGameSchema.safeParse(JSON.parse(trimmed));
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  }

  private toImportedGame(g: LichessGame, username: string): ImportedGame | null {
    if (!g.pgn) return null; // need the PGN to analyze
    const lower = username.toLowerCase();
    const whiteName = g.players.white.user?.name?.toLowerCase();
    const blackName = g.players.black.user?.name?.toLowerCase();
    const userColor: Color | null =
      whiteName === lower ? 'white' : blackName === lower ? 'black' : null;
    if (!userColor) return null; // couldn't identify the user's side

    const result = g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '1/2-1/2';
    const timeControl = g.clock
      ? `${g.clock.initial}+${g.clock.increment}`
      : (g.speed ?? 'unknown');

    return {
      id: g.id,
      pgn: g.pgn,
      white: g.players.white.user?.name ?? 'white',
      black: g.players.black.user?.name ?? 'black',
      userColor,
      result,
      timeControl,
      ...(g.speed ? { speed: g.speed } : {}),
      ...(g.opening?.eco ? { eco: g.opening.eco } : {}),
      ...(g.opening?.name ? { opening: g.opening.name } : {}),
      ...(g.clocks ? { clocks: g.clocks } : {}),
      playedAt: g.createdAt ? new Date(g.createdAt).toISOString() : new Date().toISOString(),
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
