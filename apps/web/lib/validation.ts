import { z } from 'zod';

/** Lichess usernames: letters, digits, underscore, hyphen; 2–30 chars. */
const lichessUsername = z
  .string()
  .trim()
  .min(2)
  .max(30)
  .regex(/^[\w-]+$/, 'Invalid username');

/** User-selectable analysis scope (spec feedback #6). Server hard-caps count. */
export const PERF_TYPES = ['bullet', 'blitz', 'rapid', 'classical'] as const;

export const JobParamsSchema = z.object({
  maxGames: z.coerce.number().int().min(5).max(100).optional(),
  perfTypes: z.array(z.enum(PERF_TYPES)).min(1).max(4).optional(),
});
export type JobParamsInput = z.infer<typeof JobParamsSchema>;

export const SignupSchema = z.object({
  email: z.string().trim().email().max(254),
  lichessUser: lichessUsername,
  consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required' }) }),
  maxGames: JobParamsSchema.shape.maxGames,
  perfTypes: JobParamsSchema.shape.perfTypes,
});
export type SignupInput = z.infer<typeof SignupSchema>;

/** Start the Lichess-studies OAuth import (email captured before redirect). */
export const StudyStartSchema = z.object({
  email: z.string().trim().email().max(254),
  consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required' }) }),
  perfTypes: JobParamsSchema.shape.perfTypes,
});

export const InterestSchema = z.object({
  tier: z.enum(['notify', 'monthly', 'annual']),
  reportSlug: z.string().max(64).optional(),
});
