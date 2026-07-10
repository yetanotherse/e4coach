/**
 * Typed, Zod-validated environment (spec §11.2, §16). Fail fast at startup on
 * missing/invalid config. This is the single boundary where process.env is read.
 */
import { z } from 'zod';

const boolish = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  // Database — Postgres connection strings aren't always strict WHATWG URLs
  // (encoded passwords etc.); Prisma validates the real shape.
  DATABASE_URL: z.string().min(1).startsWith('postgres'),
  DIRECT_URL: z.string().min(1).startsWith('postgres').optional(),

  // App
  APP_URL: z.string().url().default('http://localhost:3000'),
  AUTH_SECRET: z.string().min(1).default('dev-secret-change-me'),

  // LLM
  LLM_PROVIDER: z.enum(['mock', 'gemini']).default('mock'),
  LLM_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_API_KEY: z.string().optional(),

  // Engine
  ENGINE_KIND: z.enum(['mock', 'native', 'wasm']).default('mock'),
  STOCKFISH_PATH: z.string().optional(),
  // Fixed search depth → deterministic, reproducible analysis. This is the
  // primary knob. ENGINE_MOVETIME_MS is a non-deterministic time-budget fallback.
  ENGINE_DEPTH: z.coerce.number().int().min(6).max(30).default(12),
  ENGINE_MOVETIME_MS: z.coerce.number().int().positive().default(150),

  // Game source
  GAME_SOURCE: z.enum(['mock', 'lichess']).default('mock'),
  LICHESS_USER_AGENT: z.string().default('ChessCoachMVP/0.1'),
  MAX_GAMES_PER_JOB: z.coerce.number().int().positive().max(100).default(30),
  // Cap on games actually analyzed for pre-stored sources (studies/PGN). Higher
  // than the live-fetch cap for testing; lower before public launch.
  MAX_ANALYZED_GAMES: z.coerce.number().int().positive().max(1000).default(50),
  MAX_EXAMPLES_PER_WEAKNESS: z.coerce.number().int().positive().max(20).default(10),

  // Analytics / email / monitoring
  ANALYTICS_PROVIDER: z.enum(['mock', 'posthog']).default('mock'),
  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().default('https://us.i.posthog.com'),
  MAILER_PROVIDER: z.enum(['mock', 'resend']).default('mock'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Chess Coach <noreply@example.com>'),
  SENTRY_DSN: z.string().optional(),

  // Worker
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Parse & validate process.env once. Throws a readable error on misconfig. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  // Cross-field checks: a selected real provider needs its credential.
  const e = parsed.data;
  assertProviderCreds(e);
  cached = e;
  return e;
}

function assertProviderCreds(e: Env): void {
  const missing: string[] = [];
  if (e.LLM_PROVIDER === 'gemini' && !e.GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
  if (e.ENGINE_KIND === 'native' && !e.STOCKFISH_PATH) missing.push('STOCKFISH_PATH');
  if (e.ANALYTICS_PROVIDER === 'posthog' && !e.POSTHOG_KEY) missing.push('POSTHOG_KEY');
  if (e.MAILER_PROVIDER === 'resend' && !e.RESEND_API_KEY) missing.push('RESEND_API_KEY');
  if (missing.length) {
    throw new Error(`Missing credentials for selected providers: ${missing.join(', ')}`);
  }
}

/** Test/CLI helper to reset the memoized env. */
export function resetEnvCache(): void {
  cached = null;
}

export { boolish };
