import type {
  GameSource,
  FetchGamesOptions,
  ImportedGame,
} from '@chess-coach/core';
import { NoGamesError, UnknownUserError } from '@chess-coach/core';
import { MOCK_GAMES } from './fixtures.js';

/**
 * Deterministic GameSource for tests + the Phase B vertical slice.
 * Special usernames drive edge-case paths so the pipeline/UI can be exercised
 * without network:
 *   - 'unknownuser' → UnknownUserError
 *   - 'nogamesuser' → NoGamesError
 */
export class MockGameSource implements GameSource {
  readonly name = 'mock';

  constructor(private readonly games: ImportedGame[] = MOCK_GAMES) {}

  async fetchRecentGames(username: string, opts: FetchGamesOptions): Promise<ImportedGame[]> {
    if (username.toLowerCase() === 'unknownuser') {
      throw new UnknownUserError(`Unknown user: ${username}`);
    }
    if (username.toLowerCase() === 'nogamesuser') {
      throw new NoGamesError(`No public games for ${username}`);
    }
    return this.games.slice(0, opts.max);
  }
}
