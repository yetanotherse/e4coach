/**
 * Worker entrypoint. Phase A: boots config and prints selected providers so the
 * scaffold is runnable. Phase B replaces this with the job poll loop.
 */
import { loadEnv } from '@chess-coach/config';

function main(): void {
  const env = loadEnv();
  console.log('[worker] booted', {
    gameSource: env.GAME_SOURCE,
    engine: env.ENGINE_KIND,
    llm: env.LLM_PROVIDER,
    pollMs: env.WORKER_POLL_INTERVAL_MS,
  });
  console.log('[worker] pipeline poll loop lands in Phase B');
}

main();
