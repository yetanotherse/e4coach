/**
 * Worker entrypoint. Loads config, wires adapters (mock by default), and runs
 * the job poll loop until SIGINT/SIGTERM.
 */
import './loadEnv.js'; // must run before config is read
import { availableParallelism } from 'node:os';
import { loadEnv, dbFingerprint } from '@chess-coach/config';
import {
  createAnalytics,
  createEngine,
  createGameSource,
  createLlmProvider,
  createMailer,
} from '@chess-coach/adapters';
import { prisma } from '@chess-coach/db';
import { runPollLoop } from './pipeline/poller.js';

/** Host (and db name) of a Postgres URL, with credentials stripped, for logs. */
function dbTarget(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || '5432'}${u.pathname}`;
  } catch {
    return 'unparseable';
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const controller = new AbortController();

  const deps = {
    gameSource: createGameSource(env),
    engine: createEngine(env),
    llm: createLlmProvider(env),
    analytics: createAnalytics(env),
    mailer: createMailer(env),
    appUrl: env.APP_URL,
    maxGames: env.MAX_GAMES_PER_JOB,
    maxAnalyzed: env.MAX_ANALYZED_GAMES,
    maxExamples: env.MAX_EXAMPLES_PER_WEAKNESS,
    depth: env.ENGINE_DEPTH,
    movetimeMs: env.ENGINE_MOVETIME_MS,
  };

  console.log('[worker] started', {
    gameSource: deps.gameSource.name,
    engine: deps.engine.name,
    enginePool: env.ENGINE_POOL_SIZE,
    engineThreads: env.ENGINE_THREADS,
    engineHash: env.ENGINE_HASH,
    llm: deps.llm.name,
    pollMs: env.WORKER_POLL_INTERVAL_MS,
    maxGamesPerJob: env.MAX_GAMES_PER_JOB,
    maxAnalyzed: env.MAX_ANALYZED_GAMES,
    db: dbTarget(env.DATABASE_URL),
    dbFingerprint: dbFingerprint(env.DATABASE_URL),
    appUrl: env.APP_URL,
  });

  // Warn if the engine pool oversubscribes the CPU: pool × threads competing for
  // fewer cores slows every search instead of speeding it up.
  const cores = availableParallelism();
  const wanted = env.ENGINE_POOL_SIZE * env.ENGINE_THREADS;
  if (wanted > cores) {
    console.warn(
      `[worker] WARNING: ENGINE_POOL_SIZE(${env.ENGINE_POOL_SIZE}) × ENGINE_THREADS(${env.ENGINE_THREADS}) = ${wanted} exceeds ${cores} CPU core(s) — this oversubscribes the CPU and will slow analysis. Lower them to fit the box.`,
    );
  }

  // APP_URL is baked into every report link we email. If it's still the
  // localhost default in production, users get unreachable links — surface it
  // loudly rather than silently sending broken emails.
  if (env.NODE_ENV === 'production' && env.APP_URL.includes('localhost')) {
    console.warn(
      `[worker] WARNING: APP_URL is "${env.APP_URL}" in production — report email links will point at localhost. Set APP_URL to your public web URL.`,
    );
  }

  // Confirm the worker is pointed at the same DB the web app writes to: if this
  // is 0 while a job is pending in the UI, the worker's DATABASE_URL is wrong.
  try {
    const [pending, total] = await Promise.all([
      prisma.analysisJob.count({ where: { status: 'PENDING' } }),
      prisma.analysisJob.count(),
    ]);
    console.log(`[worker] jobs at boot: ${pending} pending / ${total} total`);
  } catch (err) {
    console.error('[worker] DB unreachable at boot:', err instanceof Error ? err.message : err);
  }

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      console.log(`[worker] ${sig} received, shutting down`);
      controller.abort();
    });
  }

  await runPollLoop(deps, {
    intervalMs: env.WORKER_POLL_INTERVAL_MS,
    signal: controller.signal,
    staleJobMs: env.WORKER_STALE_JOB_MS,
    maxAttempts: env.WORKER_MAX_ATTEMPTS,
  });
  await deps.engine.dispose();
  await deps.analytics.flush();
  console.log('[worker] stopped');
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
