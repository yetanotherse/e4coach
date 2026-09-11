import { z } from 'zod';

/** Lichess usernames: letters, digits, underscore, hyphen; 2–30 chars. */
const lichessUsername = z
  .string()
  .trim()
  .min(2, 'Please enter your Lichess username.')
  .max(30, "That username is too long — please check it's correct.")
  .regex(/^[\w-]+$/, "That doesn't look like a valid Lichess username.");

/** Chess.com usernames: letters, digits, underscore, hyphen; 3–25 chars. */
const chessComUsername = z
  .string()
  .trim()
  .min(3, 'Please enter your Chess.com username.')
  .max(25, "That username is too long — please check it's correct.")
  .regex(/^[\w-]+$/, "That doesn't look like a valid Chess.com username.");

/** User-selectable analysis scope. Server hard-caps count. */
export const PERF_TYPES = ['ultrabullet', 'bullet', 'blitz', 'rapid', 'classical'] as const;

const email = z.string().trim().email('Please enter a valid email address.').max(254);
const consent = z.literal(true, {
  errorMap: () => ({ message: 'Please accept the privacy policy to continue.' }),
});
const perfTypes = z
  .array(z.enum(PERF_TYPES), {
    errorMap: () => ({ message: 'Please choose valid time controls.' }),
  })
  .min(1, 'Select at least one time control.')
  .max(PERF_TYPES.length)
  .optional();

export const JobParamsSchema = z.object({
  maxGames: z.coerce.number().int().min(5).max(100).optional(),
  perfTypes,
});
export type JobParamsInput = z.infer<typeof JobParamsSchema>;

/**
 * Which platform's recent games to analyze (plans/phase-2.md 2.1). Optional for
 * backward compatibility with older clients; defaults to the server's
 * GAME_SOURCE env. Exactly the matching username is required.
 */
export const SignupSourceSchema = z.enum(['lichess', 'chesscom']).optional();

export const SignupSchema = z
  .object({
    email,
    lichessUser: lichessUsername.optional(),
    chessComUser: chessComUsername.optional(),
    source: SignupSourceSchema,
    consent,
    maxGames: JobParamsSchema.shape.maxGames,
    perfTypes,
  })
  .superRefine((v, ctx) => {
    const source = v.source ?? 'lichess';
    if (source === 'lichess' && !v.lichessUser) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lichessUser'],
        message: 'Please enter your Lichess username.',
      });
    }
    if (source === 'chesscom' && !v.chessComUser) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['chessComUser'],
        message: 'Please enter your Chess.com username.',
      });
    }
  });
export type SignupInput = z.infer<typeof SignupSchema>;

/** Analyze route body: optional platform pick (defaults to the server env). */
export const AnalyzeSchema = z.object({ source: SignupSourceSchema });

/**
 * Start the Lichess-studies OAuth import (email captured before redirect).
 * No time-control filter: study/OTB games rarely carry a [TimeControl] tag, so
 * filtering would exclude them — we import all valid chapters.
 */
export const StudyStartSchema = z.object({ email, consent });

/** Hard ceiling on games per PGN upload (spec: analyze up to 25). */
export const MAX_PGN_GAMES = 25;

/** Preview parse of an uploaded PGN blob (one or more files, concatenated). */
export const PgnParseSchema = z.object({
  pgn: z
    .string()
    .min(1, 'Upload at least one PGN file.')
    .max(2_000_000, 'That upload is too large. Please upload smaller PGN files.'),
});

/** One game the user has mapped: orientation is mandatory, time control optional. */
const MappedGameSchema = z.object({
  pgn: z.string().min(1).max(200_000),
  userColor: z.enum(['white', 'black'], {
    errorMap: () => ({ message: 'Choose which side you played for every game.' }),
  }),
  speed: z.enum(PERF_TYPES).optional(),
});

/** Submit the mapped games to create the analysis job (PGN upload flow). */
export const PgnCreateSchema = z.object({
  email,
  consent,
  games: z
    .array(MappedGameSchema)
    .min(1, 'Add at least one game to analyze.')
    .max(MAX_PGN_GAMES, `You can analyze up to ${MAX_PGN_GAMES} games per upload.`),
});
export type PgnCreateInput = z.infer<typeof PgnCreateSchema>;

export const InterestSchema = z.object({
  tier: z.enum(['notify', 'monthly', 'annual']),
  reportSlug: z.string().max(64).optional(),
  email: email.optional(), // homepage waitlist capture
});
