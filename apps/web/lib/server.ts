/** Server-only singletons: env, db, analytics. */
import 'server-only';
import { loadEnv } from '@chess-coach/config';
import { createAnalytics, createBilling, createMailer } from '@chess-coach/adapters';
import type { Analytics, Billing, Mailer } from '@chess-coach/core';
import { prisma } from '@chess-coach/db';
import { checkRateLimit, clientIp } from './rateLimit';
import { initWebSentry } from './sentry';

// Fire-and-forget: errors before init land are console-only, init itself must
// never block a request.
void initWebSentry().catch(() => undefined);

export const env = loadEnv();

export { prisma };

const g = globalThis as unknown as {
  analytics?: Analytics;
  mailer?: Mailer;
  billing?: Billing;
};
export const analytics: Analytics = g.analytics ?? (g.analytics = createAnalytics(env));
export const mailer: Mailer = g.mailer ?? (g.mailer = createMailer(env));
// Entitlements only (D-P2-2) — no gateway code; a real adapter plugs in later.
export const billing: Billing = g.billing ?? (g.billing = createBilling(env));

/**
 * Shared rate-limit gate (plans/phase-2.md 2.0.5). `kind` selects the env-tuned
 * per-minute budget; the DB bucket is per kind+IP. Disabled entirely when
 * RATE_LIMIT_ENABLED=false (e2e runs).
 */
export function rateLimit(
  req: Request,
  kind: 'auth' | 'signup' | 'track',
): Promise<boolean> {
  if (!env.RATE_LIMIT_ENABLED) return Promise.resolve(true);
  const perMin =
    kind === 'auth'
      ? env.RATE_LIMIT_AUTH_PER_MIN
      : kind === 'signup'
        ? env.RATE_LIMIT_SIGNUP_PER_MIN
        : env.RATE_LIMIT_TRACK_PER_MIN;
  return checkRateLimit(prisma, `${kind}:${clientIp(req)}`, perMin);
}

/** Consistent JSON error envelope (spec §11.2, patterns). */
export function jsonError(message: string, status: number): Response {
  return Response.json({ ok: false, error: message }, { status });
}

export function jsonOk<T>(data: T, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}
