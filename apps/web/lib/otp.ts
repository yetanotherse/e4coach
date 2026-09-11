/**
 * Pure OTP helpers for the email-code sign-in flow (plans/phase-2.md 2.0.2).
 * No framework imports — unit-testable. The code is hashed with an HMAC keyed
 * by AUTH_SECRET, so a DB leak of codeHash values can't be replayed as codes.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/** Generate a random 6-digit code, zero-padded ("000000"–"999999"). */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** HMAC-SHA256(secret, "email:code") hex. Email binds the hash to the account. */
export function hashOtpCode(secret: string, email: string, code: string): string {
  return createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
}

/** Constant-time comparison of a presented code against the stored hash. */
export function otpMatches(secret: string, email: string, code: string, storedHash: string): boolean {
  const presented = Buffer.from(hashOtpCode(secret, email, code));
  const stored = Buffer.from(storedHash);
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}
