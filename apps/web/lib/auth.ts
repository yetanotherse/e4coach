/**
 * Minimal passwordless auth (spec §6, §13). A magic link carries a short-lived
 * HMAC-signed token; verifying it sets a longer-lived signed session cookie.
 * Stateless (no session table) and self-contained — signed with AUTH_SECRET,
 * constant-time compared, and expiry-checked. httpOnly + SameSite=Lax cookie.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { env } from './server';
import { signToken, verifyToken as verify } from './token';

const SESSION_COOKIE = 'cc_session';
const MAGIC_TTL_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Verify a signed token; returns the userId or null if invalid/expired. */
export function verifyToken(token: string): string | null {
  return verify(env.AUTH_SECRET, token);
}

export function createMagicToken(userId: string): string {
  return signToken(env.AUTH_SECRET, userId, MAGIC_TTL_MS);
}

/** Set the session cookie after a verified magic link. */
export function setSession(userId: string): void {
  cookies().set(SESSION_COOKIE, signToken(env.AUTH_SECRET, userId, SESSION_TTL_MS), {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSession(): void {
  cookies().delete(SESSION_COOKIE);
}

/** Current authenticated userId from the session cookie, or null. */
export function getSessionUserId(): string | null {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return token ? verifyToken(token) : null;
}
