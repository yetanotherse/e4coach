import type { Analytics, AnalyticsEvent } from '@chess-coach/core';

export interface PostHogOptions {
  apiKey: string;
  host: string;
  fetchImpl?: typeof fetch;
}

/**
 * Analytics backed by the PostHog capture API (spec §8.4, §15). Uses the HTTP
 * capture endpoint directly (no SDK) so it works identically in the web app and
 * the worker. distinctId is a hashed email — never raw PII.
 */
export class PostHogAnalytics implements Analytics {
  readonly name = 'posthog';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: PostHogOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async capture(
    distinctId: string,
    event: AnalyticsEvent,
    properties?: Record<string, unknown>,
  ): Promise<void> {
    await this.post('/capture/', {
      event,
      distinct_id: distinctId,
      properties: properties ?? {},
    });
  }

  async identify(distinctId: string, traits?: Record<string, unknown>): Promise<void> {
    await this.post('/capture/', {
      event: '$identify',
      distinct_id: distinctId,
      properties: { $set: traits ?? {} },
    });
  }

  async flush(): Promise<void> {
    /* events are sent immediately */
  }

  private async post(path: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.fetchImpl(`${this.opts.host}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: this.opts.apiKey, ...payload }),
      });
    } catch (err) {
      // Analytics must never break the product path.
      console.warn('[posthog] capture failed:', err instanceof Error ? err.message : err);
    }
  }
}
