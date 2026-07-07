'use client';

/**
 * Client-side funnel tracking (spec §15). Phase B: a thin stub that logs in dev
 * so the events are visible. Phase D swaps the body for the PostHog browser SDK
 * without touching call sites.
 */
export type ClientEvent =
  | 'landing_view'
  | 'cta_click'
  | 'signup_submitted'
  | 'report_viewed'
  | 'report_shared'
  | 'reanalyze_clicked'
  | 'interest_clicked';

export function track(event: ClientEvent, props?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  // Fire-and-forget to the server, which forwards to PostHog with the key kept
  // server-side. keepalive lets it survive a navigation (e.g. cta_click).
  try {
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, props }),
      keepalive: true,
    });
  } catch {
    /* never let analytics break the UI */
  }
}
