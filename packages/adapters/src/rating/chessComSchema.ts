import { z } from 'zod';

/**
 * Chess.com stats response (plans/phase-2.md 2.4):
 * GET /pub/player/{username}/stats → per-perf blocks with a `last` rating.
 * The public API exposes no historical series, so the Chess.com equivalent of
 * "rating history" is the current rating per perf — our chart grows from
 * check-in snapshots. `date` is unix seconds.
 */
const PerfBlock = z
  .object({
    last: z.object({ rating: z.number(), date: z.number() }).optional(),
    best: z.object({ rating: z.number() }).optional(),
  })
  .optional();

export const ChessComStatsSchema = z
  .object({
    chess_blitz: PerfBlock,
    chess_rapid: PerfBlock,
  })
  .passthrough();

export type ChessComStats = z.infer<typeof ChessComStatsSchema>;
