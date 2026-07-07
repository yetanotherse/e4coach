import { z } from 'zod';

/**
 * Lichess game export record (NDJSON, with pgnInJson/clocks/opening). Lenient:
 * unknown fields pass through, only what we consume is validated (spec §11.2).
 */
export const LichessPlayerSchema = z.object({
  user: z.object({ name: z.string() }).optional(),
  rating: z.number().optional(),
});

export const LichessGameSchema = z.object({
  id: z.string(),
  rated: z.boolean().optional(),
  variant: z.string().optional(),
  speed: z.string().optional(),
  perf: z.string().optional(),
  createdAt: z.number().optional(),
  status: z.string().optional(),
  winner: z.enum(['white', 'black']).optional(),
  players: z.object({ white: LichessPlayerSchema, black: LichessPlayerSchema }),
  opening: z.object({ eco: z.string().optional(), name: z.string().optional() }).optional(),
  pgn: z.string().optional(),
  moves: z.string().optional(),
  clock: z
    .object({ initial: z.number(), increment: z.number(), totalTime: z.number().optional() })
    .optional(),
  clocks: z.array(z.number()).optional(),
});

export type LichessGame = z.infer<typeof LichessGameSchema>;
