import { z } from 'zod';

/**
 * Lichess rating-history response (plans/phase-2.md 2.4):
 * GET /api/user/{username}/rating-history →
 *   [{ name: "Blitz", points: [[year, month(0-based), day, rating], ...] }]
 * (Verified against the live API — the field is `points`, not `values`.)
 * Only the perfs we track are kept; others are ignored at parse time.
 */
export const LichessRatingHistorySchema = z.array(
  z.object({
    name: z.string(),
    points: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])),
  }),
);

export type LichessRatingHistory = z.infer<typeof LichessRatingHistorySchema>;
