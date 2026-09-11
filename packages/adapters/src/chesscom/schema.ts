import { z } from 'zod';

/**
 * Chess.com public API records (plans/phase-2.md 2.1). Lenient like the Lichess
 * schema: unknown fields pass through, only what we consume is validated.
 */
export const ChessComPlayerSchema = z.object({
  username: z.string(),
  rating: z.number().optional(),
  result: z.string().optional(),
});

export const ChessComGameSchema = z.object({
  url: z.string(),
  pgn: z.string().optional(),
  time_control: z.string().optional(),
  end_time: z.number().optional(), // unix seconds
  rated: z.boolean().optional(),
  time_class: z.string().optional(), // bullet | blitz | rapid | daily
  rules: z.string().optional(), // 'chess' for standard
  white: ChessComPlayerSchema,
  black: ChessComPlayerSchema,
  eco: z.string().optional(), // URL slug; the ECO code lives in the PGN's [ECO] tag
});

export const ChessComArchiveSchema = z.object({ games: z.array(z.unknown()) });

export const ChessComArchivesSchema = z.object({ archives: z.array(z.string()) });

export type ChessComGame = z.infer<typeof ChessComGameSchema>;
