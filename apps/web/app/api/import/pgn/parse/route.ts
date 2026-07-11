import { parsePgnUpload } from '@chess-coach/core';
import { PgnParseSchema, MAX_PGN_GAMES } from '@/lib/validation';
import { jsonError, jsonOk } from '@/lib/server';

/**
 * POST /api/import/pgn/parse — validate and normalize an uploaded PGN blob into
 * preview games for the mapping step. Stateless: no user, no DB writes. The
 * client holds the result in memory and submits the mapped games to
 * /api/import/pgn/create.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const parsed = PgnParseSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Invalid input', 422);
  }

  const { games, detectedGames, skipped, truncated } = parsePgnUpload(parsed.data.pgn, {
    max: MAX_PGN_GAMES,
  });

  // No tags at all: we can't tell games apart. Tell the user exactly how to fix it.
  if (detectedGames === 0) {
    return jsonError(
      'Each game needs at least one tag so we can tell games apart. Add a line like [Event "Game 1"] above each game’s moves, then re-upload.',
      422,
    );
  }
  if (games.length === 0) {
    return jsonError(
      'No readable standard-chess games found. Make sure the file contains standard-chess games in PGN format.',
      422,
    );
  }

  return jsonOk({ games, skipped, truncated });
}
