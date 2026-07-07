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
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
    console.debug('[track]', event, props ?? {});
  }
  // Phase D: window.posthog?.capture(event, props)
}
