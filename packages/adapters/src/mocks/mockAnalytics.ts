import type { Analytics, AnalyticsEvent } from '@chess-coach/core';

export interface CapturedEvent {
  distinctId: string;
  event: AnalyticsEvent;
  properties?: Record<string, unknown>;
}

/** In-memory analytics for tests + local dev. Records events for assertions. */
export class MockAnalytics implements Analytics {
  readonly name = 'mock';
  readonly events: CapturedEvent[] = [];
  readonly identities: Array<{ distinctId: string; traits?: Record<string, unknown> }> = [];

  async capture(
    distinctId: string,
    event: AnalyticsEvent,
    properties?: Record<string, unknown>,
  ): Promise<void> {
    this.events.push({ distinctId, event, properties });
  }

  async identify(distinctId: string, traits?: Record<string, unknown>): Promise<void> {
    this.identities.push({ distinctId, traits });
  }

  async flush(): Promise<void> {
    /* no-op */
  }
}
