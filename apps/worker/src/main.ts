/**
 * Worker entrypoint. Loads config, wires adapters (mock by default), and runs
 * the job poll loop until SIGINT/SIGTERM.
 */
import './loadEnv.js'; // must run before config is read
import { loadEnv } from '@chess-coach/config';
import {
  createAnalytics,
  createEngine,
  createGameSource,
  createLlmProvider,
  createMailer,
} from '@chess-coach/adapters';
import { runPollLoop } from './pipeline/poller.js';

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
    movetimeMs: env.ENGINE_MOVETIME_MS,
  };

  console.log('[worker] started', {
    gameSource: deps.gameSource.name,
    engine: deps.engine.name,
    llm: deps.llm.name,
    pollMs: env.WORKER_POLL_INTERVAL_MS,
  });

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      console.log(`[worker] ${sig} received, shutting down`);
      controller.abort();
    });
  }

  await runPollLoop(deps, { intervalMs: env.WORKER_POLL_INTERVAL_MS, signal: controller.signal });
  await deps.engine.dispose();
  await deps.analytics.flush();
  console.log('[worker] stopped');
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
