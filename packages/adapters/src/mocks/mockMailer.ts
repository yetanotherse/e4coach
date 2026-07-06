import type { Mailer, SendEmailInput } from '@chess-coach/core';

/** In-memory mailer for tests + local dev. Records sent messages. */
export class MockMailer implements Mailer {
  readonly name = 'mock';
  readonly sent: SendEmailInput[] = [];

  async send(input: SendEmailInput): Promise<void> {
    this.sent.push(input);
  }
}
