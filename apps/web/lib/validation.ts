import { z } from 'zod';

/** Lichess usernames: letters, digits, underscore, hyphen; 2–30 chars. */
const lichessUsername = z
  .string()
  .trim()
  .min(2)
  .max(30)
  .regex(/^[\w-]+$/, 'Invalid username');

export const SignupSchema = z.object({
  email: z.string().trim().email().max(254),
  lichessUser: lichessUsername,
  consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required' }) }),
});
export type SignupInput = z.infer<typeof SignupSchema>;

export const InterestSchema = z.object({
  tier: z.enum(['notify', 'monthly', 'annual']),
  reportSlug: z.string().max(64).optional(),
});

export const AnalyzeSchema = z.object({
  userId: z.string().min(1),
});
