import type { Mailer, SendEmailInput } from '@chess-coach/core';

export interface ResendOptions {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

/** Mailer backed by the Resend transactional email API (spec §8.4). */
export class ResendMailer implements Mailer {
  readonly name = 'resend';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ResendOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async send(input: SendEmailInput): Promise<void> {
    const res = await this.fetchImpl(`${this.opts.baseUrl ?? 'https://api.resend.com'}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.opts.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Resend ${res.status}: ${detail.slice(0, 300)}`);
    }
  }
}
