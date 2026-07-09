import { z } from 'zod';

/** Lichess usernames: letters, digits, underscore, hyphen; 2–30 chars. */
const lichessUsername = z
  .string()
  .trim()
  .min(2, 'Please enter your Lichess username.')
  .max(30, "That username is too long — please check it's correct.")
  .regex(/^[\w-]+$/, 'That doesn’t look like a valid Lichess username.');

/** User-selectable analysis scope. Server hard-caps count. */
export const PERF_TYPES = ['ultrabullet', 'bullet', 'blitz', 'rapid', 'classical'] as const;

const email = z.string().trim().email('Please enter a valid email address.').max(254);
const consent = z.literal(true, {
  errorMap: () => ({ message: 'Please accept the privacy policy to continue.' }),
});
const perfTypes = z
  .array(z.enum(PERF_TYPES), { errorMap: () => ({ message: 'Please choose valid time controls.' }) })
  .min(1, 'Select at least one time control.')
  .max(PERF_TYPES.length)
  .optional();

export const JobParamsSchema = z.object({
  maxGames: z.coerce.number().int().min(5).max(100).optional(),
  perfTypes,
});
export type JobParamsInput = z.infer<typeof JobParamsSchema>;

export const SignupSchema = z.object({
  email,
  lichessUser: lichessUsername,
  consent,
  maxGames: JobParamsSchema.shape.maxGames,
  perfTypes,
});
export type SignupInput = z.infer<typeof SignupSchema>;

/** Start the Lichess-studies OAuth import (email captured before redirect). */
export const StudyStartSchema = z.object({ email, consent, perfTypes });

export const InterestSchema = z.object({
  tier: z.enum(['notify', 'monthly', 'annual']),
  reportSlug: z.string().max(64).optional(),
});
