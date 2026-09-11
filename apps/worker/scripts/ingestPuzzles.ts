/**
 * Lichess puzzle DB ingestion (plans/phase-2.md 2.2b). Downloads (or reads a
 * local copy of) the puzzle CSV, keeps only puzzles whose themes map to our
 * weakness taxonomy within a rating band, and upserts them into the Puzzle
 * table. One-time + refreshable; plan generation reads it later.
 *
 * Usage (from apps/worker):
 *   npx tsx scripts/ingestPuzzles.ts [--url URL | --file PATH] [--max-per-theme 500]
 *       [--min-rating 800] [--max-rating 1600] [--min-popularity 85]
 *
 * The full CSV is ~2GB compressed (~5.9M puzzles). `zstd` must be on PATH for
 * --url downloads (we stream `curl | zstd -dc`).
 */
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { categoryForThemes, themesFromTagString } from '@chess-coach/core';
import { prisma } from '@chess-coach/db';

interface Args {
  url?: string;
  file?: string;
  maxPerTheme: number;
  minRating: number;
  maxRating: number;
  minPopularity: number;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const num = (v: string | undefined, dflt: number): number =>
    v !== undefined && Number.isFinite(Number(v)) ? Number(v) : dflt;
  return {
    url: get('url'),
    file: get('file'),
    maxPerTheme: num(get('max-per-theme'), 500),
    minRating: num(get('min-rating'), 800),
    maxRating: num(get('max-rating'), 1600),
    minPopularity: num(get('min-popularity'), 85),
  };
}

/** One CSV row, already validated for what we consume. */
interface PuzzleRow {
  externalId: string;
  fen: string;
  line: string; // UCI moves, space-separated
  rating: number;
  popularity: number;
  themes: string[];
}

function parseCsvLine(line: string): PuzzleRow | null {
  const cols = line.split(',');
  if (cols.length < 10) return null;
  const [puzzleId, fen, moves, rating, , popularity, , themes] = cols;
  if (!puzzleId || !fen || !moves || !themes) return null;
  if (!fen.includes(' ')) return null; // FEN sanity
  const movesTrimmed = moves.trim();
  if (!/^[a-h][1-8]/.test(movesTrimmed)) return null; // UCI moves start with a square
  const r = Number(rating);
  if (!Number.isFinite(r)) return null;
  const p = Number(popularity);
  if (!Number.isFinite(p)) return null;
  return {
    externalId: puzzleId,
    fen,
    line: movesTrimmed,
    rating: r,
    popularity: p,
    themes: themesFromTagString(themes),
  };
}

interface Progress {
  scanned: number;
  kept: number;
  byCategory: Record<string, number>;
}

function isWanted(row: PuzzleRow, args: Args, seen: Set<string>): boolean {
  if (seen.has(row.externalId)) return false;
  if (row.rating < args.minRating || row.rating > args.maxRating) return false;
  if (row.popularity < args.minPopularity) return false;
  return categoryForThemes(row.themes) !== null;
}

async function ingestStream(stream: NodeJS.ReadableStream, args: Args): Promise<Progress> {
  const progress: Progress = { scanned: 0, kept: 0, byCategory: {} };
  const seen = new Set<string>();
  const buffer: Array<{
    externalId: string;
    fen: string;
    solutionUci: string;
    line: string;
    rating: number;
    themes: string;
    category: string;
  }> = [];
  let header = true;

  const flush = async (): Promise<void> => {
    if (buffer.length === 0) return;
    const batch = buffer.splice(0, buffer.length);
    await prisma.puzzle.createMany({ data: batch, skipDuplicates: true });
  };

  let rest = '';
  for await (const chunk of stream) {
    rest += chunk.toString();
    let nl: number;
    while ((nl = rest.indexOf('\n')) >= 0) {
      const line = rest.slice(0, nl).trim();
      rest = rest.slice(nl + 1);
      if (header) {
        header = false;
        continue;
      }
      if (!line) continue;
      const row = parseCsvLine(line);
      if (!row) continue;
      progress.scanned++;
      if (!isWanted(row, args, seen)) continue;
      const category = categoryForThemes(row.themes)!;
      if ((progress.byCategory[category] ?? 0) >= args.maxPerTheme) continue;
      seen.add(row.externalId);
      progress.kept++;
      progress.byCategory[category] = (progress.byCategory[category] ?? 0) + 1;
      buffer.push({
        externalId: row.externalId,
        fen: row.fen,
        solutionUci: row.line.split(' ')[0]!,
        line: row.line,
        rating: row.rating,
        themes: row.themes.join(' '),
        category,
      });
      if (buffer.length >= 500) await flush();
      if (progress.scanned % 250_000 === 0) {
        console.log(`[ingest] scanned ${progress.scanned}, kept ${progress.kept}`);
      }
    }
  }
  await flush();
  return progress;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[ingest] args: maxPerTheme=${args.maxPerTheme} rating=[${args.minRating},${args.maxRating}] popularity>=${args.minPopularity}`,
  );

  let progress: Progress;
  if (args.file) {
    const stream = createReadStream(args.file, { encoding: 'utf8' });
    progress = await ingestStream(stream, args);
  } else {
    const url = args.url ?? 'https://database.lichess.org/lichess_db_puzzle.csv.zst';
    if (!args.url && !args.file) console.log(`[ingest] downloading ${url} (large — be patient)`);
    // curl -sL URL | zstd -dc : the DB ships zstd-compressed; decode in-flight.
    progress = await new Promise<Progress>((resolve, reject) => {
      const child = spawn('sh', ['-c', `curl -sL '${url}' | zstd -dc`], {
        stdio: ['ignore', 'pipe', 'inherit'],
      });
      child.on('error', reject);
      child.stdout!.setEncoding('utf8');
      ingestStream(child.stdout!, args).then(resolve, reject);
    });
  }

  console.log(
    `[ingest] done: scanned ${progress.scanned}, kept ${progress.kept}`,
    progress.byCategory,
  );
  const total = await prisma.puzzle.count();
  console.log(`[ingest] Puzzle table now holds ${total} rows`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[ingest] failed:', err);
    process.exit(1);
  });
