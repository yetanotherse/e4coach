import { describe, it, expect } from 'vitest';
import { signToken, verifyToken } from './token';

const SECRET = 'test-secret';

describe('token', () => {
  it('round-trips a valid token', () => {
    const t = signToken(SECRET, 'user123', 60_000);
    expect(verifyToken(SECRET, t)).toBe('user123');
  });

  it('rejects a tampered payload', () => {
    const t = signToken(SECRET, 'user123', 60_000);
    const [, sig] = t.split('.');
    const forged = `${Buffer.from(JSON.stringify({ sub: 'admin', exp: Date.now() + 60_000 })).toString('base64url')}.${sig}`;
    expect(verifyToken(SECRET, forged)).toBeNull();
  });

  it('rejects a wrong secret', () => {
    const t = signToken(SECRET, 'user123', 60_000);
    expect(verifyToken('other-secret', t)).toBeNull();
  });

  it('rejects an expired token', () => {
    const t = signToken(SECRET, 'user123', -1);
    expect(verifyToken(SECRET, t)).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(verifyToken(SECRET, 'garbage')).toBeNull();
    expect(verifyToken(SECRET, '')).toBeNull();
  });
});
