/** Analytics port (spec §8.4, §15). Thin wrapper over PostHog. */

/** The exact funnel events instrumented for the MVP (spec §15). */
export type AnalyticsEvent =
  | 'landing_view'
  | 'cta_click'
  | 'signup_submitted'
  | 'pgn_upload_submitted'
  | 'pgn_map_submitted'
  | 'signup_completed'
  | 'job_started'
  | 'job_completed'
  | 'job_failed'
  | 'report_viewed'
  | 'report_shared'
  | 'reanalyze_clicked'
  | 'interest_clicked'
  | 'feedback_submitted'
  // Phase 2 coaching events (plans/phase-2.md)
  | 'drill_attempted'
  | 'drill_solved'
  | 'review_completed';

export interface Analytics {
  readonly name: string;
  /** distinctId should be a HASHED email (spec §15) — never raw PII. */
  capture(
    distinctId: string,
    event: AnalyticsEvent,
    properties?: Record<string, unknown>,
  ): Promise<void>;
  identify(distinctId: string, traits?: Record<string, unknown>): Promise<void>;
  flush(): Promise<void>;
}
