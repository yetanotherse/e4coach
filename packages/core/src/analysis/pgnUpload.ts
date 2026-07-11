/**
 * Raw PGN file upload (one or more files, one or more games each) → preview
 * games for the mapping step. Unlike a Lichess study, an uploaded PGN gives us
 * NO reliable signal for which side the user played, so orientation is left
 * unset here and collected from the user in the mapping UI.
 *
 * Splitting standardizes on the PGN **tag** as the game delimiter: every game
 * must carry at least one `[Tag "value"]`. This is the only delimiter robust to
 * editors that strip newlines (which can put several games on one line) and to
 * bare-movetext files. Tagless input is rejected upstream with a fix message.
 *
 * Pure: chess.js only, no I/O. Reuses a few pure helpers from the study parser.
 */
import { Chess } from 'chess.js';
import { hash, playedAtFrom, speedFromTimeControl } from './studies.js';

const MIN_PLIES = 6; // at least 3 full moves — skip near-empty/placeholder games

/**
 * A single PGN tag, matched anywhere (not line-anchored) so it works even when
 * an editor has stripped the newlines between tags and movetext.
 */
const TAG_RE = /\[\s*([A-Za-z][A-Za-z0-9_]*)\s+"((?:[^"\\]|\\.)*)"\s*\]/g;

const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

/** A parsed, validated game awaiting the user's orientation choice (mapping step). */
export interface UploadedGamePreview {
  /** stable synthetic id (hash of normalized PGN) — dedup key + Game.externalId */
  id: string;
  /** normalized, standard PGN loadable by chess.js (board stepper + analysis) */
  pgn: string;
  white: string;
  black: string;
  event?: string;
  result: string; // '1-0' | '0-1' | '1/2-1/2' | '*'
  timeControl: string; // raw [TimeControl] tag, or 'unknown'
  /** derived speed bucket if the tag was parseable — prefills the TC dropdown */
  speedGuess?: string;
  playedAt: string; // ISO
  plyCount: number;
}

export interface ParsePgnUploadOptions {
  /** hard ceiling on games returned (excess is counted as truncated) */
  max: number;
}

export interface ParsePgnUploadResult {
  games: UploadedGamePreview[];
  /** tag-delimited game blocks found, before validity filtering (0 = no tags) */
  detectedGames: number;
  /** blocks that were not importable (unparseable, too short, non-standard) */
  skipped: number;
  /** valid games beyond `max` that were dropped (spec: first-N + warn) */
  truncated: number;
}

/**
 * Split a PGN blob into per-game strings using tag boundaries. A tag starts a
 * new game when it's the first tag, or when movetext separates it from the
 * previous tag (consecutive whitespace-only-separated tags share one header).
 * Newline-agnostic: handles games that share a single line. Leading movetext
 * before the first tag is a game missing its tag and is dropped by the caller.
 */
export function splitPgnGames(pgn: string): string[] {
  const starts: number[] = [];
  let prevEnd = -1;
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(pgn)) !== null) {
    const gap = prevEnd < 0 ? '' : pgn.slice(prevEnd, m.index);
    if (prevEnd < 0 || /\S/.test(gap)) starts.push(m.index);
    prevEnd = TAG_RE.lastIndex;
  }
  const blocks: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1]! : pgn.length;
    const block = pgn.slice(starts[i]!, end).trim();
    if (block) blocks.push(block);
  }
  return blocks;
}

/** Extract every tag in a block into a map (last write wins). */
function extractTags(block: string): Record<string, string> {
  const tags: Record<string, string> = {};
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(block)) !== null) tags[m[1]!] = m[2]!;
  return tags;
}

/**
 * Rebuild a clean, standard PGN from a game block: header tags on their own
 * lines, then the mainline movetext with comments/variations/NAGs stripped
 * (chess.js can't parse those). Newline-agnostic — relies on TAG_RE, not on a
 * blank-line header/body split.
 */
function normalizeUploadPgn(block: string, tags: Record<string, string>): string {
  let moves = block.replace(TAG_RE, ' '); // drop the tags, keep movetext
  moves = moves.replace(/\{[^}]*\}/g, ' '); // comments
  let prev: string;
  do {
    prev = moves;
    moves = moves.replace(/\([^()]*\)/g, ' '); // variations (innermost-out)
  } while (moves !== prev);
  moves = moves
    .replace(/\$\d+/g, ' ') // NAGs
    .replace(/\s+/g, ' ')
    .trim();
  const header = Object.entries(tags)
    .map(([k, v]) => `[${k} "${v}"]`)
    .join('\n');
  return `${header}\n\n${moves}`;
}

/** Result from the [Result] tag, else a trailing movetext result token, else '*'. */
function resultFrom(tags: Record<string, string>, moves: string): string {
  if (tags.Result && RESULTS.has(tags.Result)) return tags.Result;
  const last = moves.trim().split(/\s+/).pop();
  return last && RESULTS.has(last) ? last : '*';
}

/** Convert one tag-delimited game block to a preview, or null if not importable. */
function blockToPreview(block: string): UploadedGamePreview | null {
  const tags = extractTags(block);
  if ((tags.Variant ?? 'Standard') !== 'Standard') return null;

  const cleanPgn = normalizeUploadPgn(block, tags);
  let plies: number;
  try {
    const chess = new Chess();
    chess.loadPgn(cleanPgn);
    plies = chess.history().length;
  } catch {
    return null;
  }
  if (plies < MIN_PLIES) return null;

  const speedGuess = speedFromTimeControl(tags.TimeControl);
  const movesOnly = cleanPgn.slice(cleanPgn.indexOf('\n\n') + 2);

  return {
    id: `pgn-${Math.abs(hash(cleanPgn))}`,
    pgn: cleanPgn,
    white: tags.White ?? 'White',
    black: tags.Black ?? 'Black',
    ...(tags.Event && tags.Event !== '?' ? { event: tags.Event } : {}),
    result: resultFrom(tags, movesOnly),
    timeControl: tags.TimeControl ?? 'unknown',
    ...(speedGuess ? { speedGuess } : {}),
    playedAt: playedAtFrom(tags),
    plyCount: plies,
  };
}

/**
 * Parse a concatenated multi-game PGN (from one or more uploaded files) into
 * validated preview games. Requires ≥1 tag per game (the split delimiter),
 * dedups identical games, enforces `max` (first-N), and counts
 * unimportable/dropped games so the UI can warn the user.
 */
export function parsePgnUpload(pgn: string, opts: ParsePgnUploadOptions): ParsePgnUploadResult {
  const blocks = splitPgnGames(pgn);
  const games: UploadedGamePreview[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let truncated = 0;

  for (const block of blocks) {
    const game = blockToPreview(block);
    if (!game || seen.has(game.id)) {
      if (!game) skipped++;
      continue;
    }
    if (games.length >= opts.max) {
      truncated++;
      continue;
    }
    seen.add(game.id);
    games.push(game);
  }

  return { games, detectedGames: blocks.length, skipped, truncated };
}
