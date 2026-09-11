/**
 * Sentry init for the web server runtime (plans/phase-2.md 2.0.6). Imported
 * (and awaited lazily) by lib/server.ts — every server entry point passes
 * through that module, so this runs once per server process. No-op without a
 * DSN. Kept free of lib/server.ts imports to avoid a cycle and to keep the
 * Sentry graph free of Prisma (the instrumentation/runtime boundary can't
 * bundle it).
 */
import { loadEnv } from '@chess-coach/config';

const g = globalThis as unknown as { __sentryWebInit?: Promise<void> };

export async function initWebSentry(): Promise<void> {
  if (!g.__sentryWebInit) {
    g.__sentryWebInit = (async () => {
      const env = loadEnv();
      if (!env.SENTRY_DSN) return;
      const Sentry = await import('@sentry/node');
      Sentry.init({
        dsn: env.SENTRY_DSN,
        environment: env.NODE_ENV,
        // Performance tracing off by default — error capture only until tuned.
        tracesSampleRate: 0,
      });
    })();
  }
  return g.__sentryWebInit;
}
