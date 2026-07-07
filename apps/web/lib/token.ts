/**
 * Pure HMAC-signed token helpers (no framework imports, unit-testable). Used by
 * lib/auth.ts for magic links and session cookies.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

interface TokenPayload {
  sub: string; // userId
  exp: number; // epoch ms
}

function sign(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function signToken(secret: string, userId: string, ttlMs: number): string {
  const payload: TokenPayload = { sub: userId, exp: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(secret, body)}`;
}

/** Verify signature + expiry with a constant-time compare. Returns userId or null. */
export function verifyToken(secret: string, token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  const expected = sign(secret, body);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload;
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Date.now()) return null;
    return payload.sub;
  } catch {
    return null;
  }
}
