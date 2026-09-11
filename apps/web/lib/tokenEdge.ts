/**
 * Async HMAC token helpers for the Edge runtime (middleware). crypto.subtle is
 * the only HMAC available there; Node's sync crypto (lib/token.ts) can't load.
 * Payload shape matches lib/token.ts exactly, so tokens are interchangeable.
 */
export const SESSION_COOKIE = 'cc_session';

export interface TokenPayload {
  sub: string; // userId
  exp: number; // epoch ms
}

async function hmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function signTokenEdge(secret: string, userId: string, ttlMs: number): Promise<string> {
  const payload: TokenPayload = { sub: userId, exp: Date.now() + ttlMs };
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

/** Verify signature (constant-time via subtle.verify) + expiry. Returns the payload or null. */
export async function verifyTokenEdge(secret: string, token: string): Promise<TokenPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const body = parts[0];
  const sig = parts[1];
  if (!body || !sig) return null;
  try {
    const key = await hmacKey(secret, ['verify']);
    const ok = await crypto.subtle.verify('HMAC', key, fromBase64Url(sig), new TextEncoder().encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as TokenPayload;
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
