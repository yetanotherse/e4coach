/**
 * Lichess study export (multi-game PGN) → ImportedGame[] (spec Phase F).
 *
 * A chapter is importable when it is a Standard game with a real mainline and a
 * determinable side to analyze. The side comes from the [Orientation] tag (the
 * board orientation set in the Lichess UI — requires `?orientation=true` on the
 * export), falling back to matching the user's username against [White]/[Black].
 * Player tags carry REAL names for OTB imports (e.g. "Tavish Singh") and are
 * absent on many chapters, so orientation is the reliable signal. Chapters with
 * neither signal, or too few moves, are skipped.
 *
 * Pure: chess.js only, no I/O.
 */
import { Chess } from 'chess.js';
import type { Color, ImportedGame } from '../types.js';

export interface ParseStudiesOptions {
  /** the authenticated user's Lichess username (whose side we analyze) */
  username: string;
  /** optional time-control filter (lowercase speeds); keep only matches */
  perfTypes?: string[];
  /** import ceiling */
  max: number;
}

export interface ParseStudiesResult {
  games: ImportedGame[];
  /** chapters that were not importable (not a matched, standard, real game) */
  skipped: number;
}

const MIN_PLIES = 6; // at least 3 full moves — skip near-empty position chapters

/** Split a multi-game PGN into per-chapter PGN strings. */
export function splitChapters(pgn: string): string[] {
  return pgn
    .split(/\n\n(?=\[Event )/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Study PGNs carry comments {…}, NAGs $n, and variations (…) that chess.js
 * can't parse. Strip them down to the mainline SAN and rebuild a loadable PGN
 * (headers + clean movetext). This cleaned PGN is what we analyze and replay.
 */
export function cleanChapterPgn(chapter: string): string {
  const sep = chapter.indexOf('\n\n');
  const headers = sep >= 0 ? chapter.slice(0, sep) : '';
  const body = sep >= 0 ? chapter.slice(sep + 2) : chapter;
  let moves = body.replace(/\{[^}]*\}/g, ' '); // comments
  let prev: string;
  do {
    prev = moves;
    moves = moves.replace(/\([^()]*\)/g, ' '); // variations (innermost-out)
  } while (moves !== prev);
  moves = moves
    .replace(/\$\d+/g, ' ') // NAGs
    .replace(/\s+/g, ' ')
    .trim();
  return `${headers}\n\n${moves}`;
}

/** Parse PGN header tags into a map. */
function parseTags(chapter: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const m of chapter.matchAll(/^\[(\w+)\s+"([^"]*)"\]/gm)) {
    tags[m[1]!] = m[2]!;
  }
  return tags;
}

/** Classify a Lichess-style "initial+increment" time control into a speed. */
export function speedFromTimeControl(tc: string | undefined): string | undefined {
  if (!tc || tc === '-') return undefined;
  const m = tc.match(/^(\d+)\+(\d+)$/);
  if (!m) return undefined;
  const est = Number(m[1]) + 40 * Number(m[2]); // Lichess estimated duration
  if (est < 30) return 'ultrabullet';
  if (est < 180) return 'bullet';
  if (est < 480) return 'blitz';
  if (est < 1500) return 'rapid';
  return 'classical';
}

/** 8-char Lichess game id from a Site URL, else a study/chapter id. */
function idFor(tags: Record<string, string>): string | undefined {
  const site = tags.Site?.match(/lichess\.org\/([a-zA-Z0-9]{8})(?:$|[/?#])/);
  if (site) return site[1];
  const chap = tags.ChapterURL?.match(/study\/(\w+)\/(\w+)/);
  if (chap) return `${chap[1]}_${chap[2]}`;
  return undefined;
}

function playedAtFrom(tags: Record<string, string>): string {
  const date = tags.UTCDate ?? tags.Date;
  if (date && /^\d{4}\.\d{2}\.\d{2}$/.test(date)) {
    return new Date(date.replace(/\./g, '-') + 'T00:00:00.000Z').toISOString();
  }
  return new Date().toISOString();
}

/** Convert one chapter to an ImportedGame, or null if not importable. */
function chapterToGame(
  chapter: string,
  username: string,
  perfTypes: string[] | undefined,
): ImportedGame | null {
  const tags = parseTags(chapter);
  if ((tags.Variant ?? 'Standard') !== 'Standard') return null;

  // Prefer the board orientation set in the UI; fall back to a username match.
  const orientation = tags.Orientation?.toLowerCase();
  const lower = username.toLowerCase();
  const white = tags.White?.toLowerCase();
  const black = tags.Black?.toLowerCase();
  const userColor: Color | null =
    orientation === 'white' || orientation === 'black'
      ? (orientation as Color)
      : white === lower
        ? 'white'
        : black === lower
          ? 'black'
          : null;
  if (!userColor) return null; // no way to tell which side to analyze

  // Validate it's a real, legal game with enough moves. Study movetext has
  // annotations chess.js can't parse, so clean to the mainline first.
  const cleanPgn = cleanChapterPgn(chapter);
  let plies: number;
  try {
    const chess = new Chess();
    chess.loadPgn(cleanPgn);
    plies = chess.history().length;
  } catch {
    return null;
  }
  if (plies < MIN_PLIES) return null;

  const speed = speedFromTimeControl(tags.TimeControl);
  if (perfTypes && perfTypes.length > 0) {
    if (!speed || !perfTypes.includes(speed)) return null;
  }

  const id = idFor(tags) ?? `study-${Math.abs(hash(chapter))}`;
  const result =
    tags.Result === '1-0' || tags.Result === '0-1' || tags.Result === '1/2-1/2'
      ? tags.Result
      : '*';

  return {
    id,
    pgn: cleanPgn, // mainline-only, loadable by chess.js (analysis + stepper)
    white: tags.White ?? 'white',
    black: tags.Black ?? 'black',
    userColor,
    result,
    timeControl: tags.TimeControl ?? 'unknown',
    ...(speed ? { speed } : {}),
    ...(tags.ECO && tags.ECO !== '?' ? { eco: tags.ECO } : {}),
    ...(tags.Opening && tags.Opening !== '?' ? { opening: tags.Opening } : {}),
    playedAt: playedAtFrom(tags),
  };
}

export function parseLichessStudies(pgn: string, opts: ParseStudiesOptions): ParseStudiesResult {
  const chapters = splitChapters(pgn);
  const games: ImportedGame[] = [];
  const seen = new Set<string>(); // dedup the same game appearing in >1 chapter
  let skipped = 0;
  for (const chapter of chapters) {
    if (games.length >= opts.max) {
      skipped++;
      continue;
    }
    const game = chapterToGame(chapter, opts.username, opts.perfTypes);
    if (game && !seen.has(game.id)) {
      seen.add(game.id);
      games.push(game);
    } else {
      skipped++;
    }
  }
  return { games, skipped };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}
