/** Mailer port (spec §8.4). Thin wrapper over Resend. */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface Mailer {
  readonly name: string;
  send(input: SendEmailInput): Promise<void>;
}
