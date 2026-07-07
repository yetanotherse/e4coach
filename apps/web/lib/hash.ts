import { createHash } from 'node:crypto';

/** Stable, non-reversible id for analytics — never send raw email (spec §15). */
export function hashEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}
