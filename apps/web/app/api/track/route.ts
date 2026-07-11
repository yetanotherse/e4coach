import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { analytics, jsonError, jsonOk } from '@/lib/server';
import { getSessionUserId } from '@/lib/auth';
import type { AnalyticsEvent } from '@chess-coach/core';

const ANON_COOKIE = 'cc_anon';

const CLIENT_EVENTS = [
  'landing_view',
  'cta_click',
  'signup_submitted',
  'pgn_upload_submitted',
  'pgn_map_submitted',
  'report_viewed',
  'report_shared',
  'reanalyze_clicked',
  'interest_clicked',
  'feedback_submitted',
] as const;

const TrackSchema = z.object({
  event: z.enum(CLIENT_EVENTS),
  props: z.record(z.unknown()).optional(),
});

/**
 * POST /api/track — forward a client funnel event to server-side analytics so
 * the PostHog key never reaches the browser (spec §15). Uses the session user
 * id when signed in, otherwise a stable anonymous cookie for funnel continuity.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }
  const parsed = TrackSchema.safeParse(body);
  if (!parsed.success) return jsonError('Invalid event', 422);

  const jar = cookies();
  let anon = jar.get(ANON_COOKIE)?.value;
  if (!anon) {
    anon = randomUUID();
    jar.set(ANON_COOKIE, anon, { sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  }
  const distinctId = getSessionUserId() ?? anon;

  await analytics.capture(distinctId, parsed.data.event as AnalyticsEvent, parsed.data.props);
  return jsonOk({ tracked: true });
}
