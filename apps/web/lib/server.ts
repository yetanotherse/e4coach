/** Server-only singletons: env, db, analytics. */
import 'server-only';
import { loadEnv } from '@chess-coach/config';
import { createAnalytics, createMailer } from '@chess-coach/adapters';
import type { Analytics, Mailer } from '@chess-coach/core';

export const env = loadEnv();

export { prisma } from '@chess-coach/db';

const g = globalThis as unknown as { analytics?: Analytics; mailer?: Mailer };
export const analytics: Analytics = g.analytics ?? (g.analytics = createAnalytics(env));
export const mailer: Mailer = g.mailer ?? (g.mailer = createMailer(env));

/** Consistent JSON error envelope (spec §11.2, patterns). */
export function jsonError(message: string, status: number): Response {
  return Response.json({ ok: false, error: message }, { status });
}

export function jsonOk<T>(data: T, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}
