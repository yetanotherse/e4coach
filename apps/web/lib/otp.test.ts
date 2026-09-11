import { describe, it, expect } from 'vitest';
import { generateOtpCode, hashOtpCode, otpMatches } from './otp';

describe('otp helpers', () => {
  it('generates 6-digit zero-padded codes', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateOtpCode()).toMatch(/^\d{6}$/);
    }
  });

  it('generates varying codes', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) codes.add(generateOtpCode());
    expect(codes.size).toBeGreaterThan(10);
  });

  it('hashes deterministically and binds to email + code', () => {
    const a = hashOtpCode('secret', 'u@example.com', '123456');
    expect(hashOtpCode('secret', 'u@example.com', '123456')).toBe(a);
    expect(hashOtpCode('secret', 'other@example.com', '123456')).not.toBe(a);
    expect(hashOtpCode('secret', 'u@example.com', '123457')).not.toBe(a);
    expect(hashOtpCode('other-secret', 'u@example.com', '123456')).not.toBe(a);
  });

  it('matches the right code and rejects wrong ones', () => {
    const stored = hashOtpCode('secret', 'u@example.com', '123456');
    expect(otpMatches('secret', 'u@example.com', '123456', stored)).toBe(true);
    expect(otpMatches('secret', 'u@example.com', '654321', stored)).toBe(false);
    expect(otpMatches('wrong', 'u@example.com', '123456', stored)).toBe(false);
  });

  it('does not accept the raw hash as a code', () => {
    const stored = hashOtpCode('secret', 'u@example.com', '123456');
    expect(otpMatches('secret', 'u@example.com', stored, stored)).toBe(false);
  });
});
