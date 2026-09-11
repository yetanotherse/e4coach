/**
 * Typed, Zod-validated environment (spec §11.2, §16). Fail fast at startup on
 * missing/invalid config. This is the single boundary where process.env is read.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';

const boolish = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

/**
 * A short, non-reversible fingerprint of a connection string. Printed by both
 * the web app and the worker so "are we on the same database?" is a one-glance
 * check — matching fingerprints = same DB. Leaks nothing (one-way hash), so it's
 * safe to log and to expose on a health endpoint.
 */
export function dbFingerprint(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 8);
}

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
  // UCI Threads per engine process. Keep at 1 for deterministic, reproducible
  // analysis (multi-threaded Stockfish search is non-deterministic). Use more
  // cores via ENGINE_POOL_SIZE instead — that stays deterministic.
  ENGINE_THREADS: z.coerce.number().int().min(1).max(1024).default(1),
  // UCI Hash (MB) per engine process. Total worker RAM ≈ pool size × this.
  ENGINE_HASH: z.coerce.number().int().min(1).max(65536).default(256),
  // Parallel engine processes; set to the CPU-core count to saturate the box.
  ENGINE_POOL_SIZE: z.coerce.number().int().min(1).max(64).default(2),

  // Deep analysis — a second, deeper MultiPV pass over ONLY the mistakes shown
  // in the report, used to explain why the engine's move was better. Off by
  // default: it adds real wall-clock time to every job.
  DEEP_ANALYSIS_ENABLED: boolish.default('false'),
  // Deeper than ENGINE_DEPTH — these lines are shown to the user, so they need
  // to be trustworthy several plies in, not just good enough to score CPL.
  DEEP_ANALYSIS_DEPTH: z.coerce.number().int().min(8).max(30).default(20),
  // 3 gives the engine's choice plus two alternatives that also held.
  DEEP_ANALYSIS_MULTIPV: z.coerce.number().int().min(1).max(5).default(3),
  // The only real bound on this stage's runtime. Each position costs two evals
  // at DEEP_ANALYSIS_DEPTH, roughly 10-30x a scoring-pass eval.
  DEEP_ANALYSIS_MAX_POSITIONS: z.coerce.number().int().min(1).max(200).default(40),
  // Plies of each variation kept for the stepper.
  DEEP_ANALYSIS_PV_PLIES: z.coerce.number().int().min(2).max(12).default(6),

  // Game source
  GAME_SOURCE: z.enum(['mock', 'lichess', 'chesscom']).default('mock'),
  LICHESS_USER_AGENT: z.string().default('ChessCoachMVP/0.1'),
  // Chess.com 403s generic UAs — the UA must carry a contact identity.
  CHESSCOM_USER_AGENT: z.string().default('ChessCoachMVP/0.1'),
  // Hard ceiling on live-fetched games per job. Must be >= the largest option
  // in the signup dropdown (currently 60), otherwise a user's selection is
  // silently clamped down by the worker (runner.ts requestedMax = min(...)).
  MAX_GAMES_PER_JOB: z.coerce.number().int().positive().max(100).default(60),
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

  // Billing (plans/phase-2.md 2.5 / D-P2-2). Gateway DEFERRED — the port exists,
  // only the mock adapter is real. Future values: e.g. 'stripe', 'paddle'.
  BILLING_PROVIDER: z.enum(['mock']).default('mock'),

  // Rate limiting (plans/phase-2.md 2.0.5) — DB-backed fixed windows per IP.
  // Fixed 60s windows; values are requests per minute per bucket.
  RATE_LIMIT_ENABLED: boolish.default('true'),
  RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_SIGNUP_PER_MIN: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_TRACK_PER_MIN: z.coerce.number().int().positive().default(600),

  // Worker
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  // Stale-job recovery: a job claimed but left in an in-progress state with no
  // progress for this long (a killed/restarted worker) is requeued to PENDING.
  // Must exceed the gap between runner heartbeats (one game's eval) plus the
  // longest non-heartbeat stage — 10 min is comfortably safe.
  WORKER_STALE_JOB_MS: z.coerce.number().int().positive().default(600_000),
  // Give up (mark FAILED) after this many claim attempts, so a job that keeps
  // killing the worker can't loop forever.
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),

  // Weekly nudge email (plans/phase-2.md 2.4). Scanned at most once per
  // interval; each user is nudged at most once per calendar week.
  NUDGE_ENABLED: boolish.default('true'),
  NUDGE_SCAN_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),
  NUDGE_MAX_PER_SCAN: z.coerce.number().int().positive().default(50),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Parse & validate process.env once. Throws a readable error on misconfig. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  // Trim stray surrounding whitespace from known keys before validating. Docker's
  // `--env-file` keeps everything after `=` verbatim (trailing spaces included),
  // which would otherwise fail enum checks (e.g. ENGINE_KIND="native   ").
  const trimmed: NodeJS.ProcessEnv = { ...source };
  for (const key of Object.keys(EnvSchema.shape)) {
    const value = trimmed[key];
    if (typeof value === 'string') trimmed[key] = value.trim();
  }
  const parsed = EnvSchema.safeParse(trimmed);
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
