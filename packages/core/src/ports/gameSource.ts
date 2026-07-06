/** GameSource port (spec §8.3). */
import type { ImportedGame } from '../types.js';

export interface FetchGamesOptions {
  max: number;
  rated?: boolean;
  perfTypes?: string[];
}

export class UnknownUserError extends Error {}
export class NoGamesError extends Error {}

export interface GameSource {
  readonly name: string;
  fetchRecentGames(username: string, opts: FetchGamesOptions): Promise<ImportedGame[]>;
}
