import { randomBytes } from 'node:crypto';

/** Long, unguessable, URL-safe token for the shareable report link (spec §11.2). */
export function generateSlug(): string {
  return randomBytes(24).toString('base64url');
}
