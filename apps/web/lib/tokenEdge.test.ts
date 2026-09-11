import { describe, it, expect } from 'vitest';
import { signTokenEdge, verifyTokenEdge, SESSION_COOKIE } from './tokenEdge';

describe('tokenEdge (Web Crypto HMAC)', () => {
  const secret = 'test-secret';

  it('round-trips a signed token', async () => {
    const token = await signTokenEdge(secret, 'user-1', 60_000);
    const payload = await verifyTokenEdge(secret, token);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('user-1');
    expect(payload!.exp).toBeGreaterThan(Date.now());
  });

  it('rejects a tampered payload', async () => {
    const token = await signTokenEdge(secret, 'user-1', 60_000);
    const [body] = token.split('.');
    const other = JSON.stringify({ sub: 'user-2', exp: Date.now() + 60_000 });
    const fake = `${btoa(other)}.${token.split('.')[1]}`;
    void body;
    expect(await verifyTokenEdge(secret, fake)).toBeNull();
  });

  it('rejects a wrong secret', async () => {
    const token = await signTokenEdge(secret, 'user-1', 60_000);
    expect(await verifyTokenEdge('other', token)).toBeNull();
  });

  it('rejects expired tokens', async () => {
    const token = await signTokenEdge(secret, 'user-1', -1);
    expect(await verifyTokenEdge(secret, token)).toBeNull();
  });

  it('rejects malformed tokens', async () => {
    expect(await verifyTokenEdge(secret, 'garbage')).toBeNull();
    expect(await verifyTokenEdge(secret, 'a.b.c')).toBeNull();
  });

  it('exposes the session cookie name shared with middleware', () => {
    expect(SESSION_COOKIE).toBe('cc_session');
  });
});
