import { describe, it, expect } from 'vitest';
import { windowStartFor, isAllowed } from './rateLimit';

describe('rate limit window math', () => {
  it('aligns to fixed windows', () => {
    expect(windowStartFor(0, 60_000)).toBe(0);
    expect(windowStartFor(59_999, 60_000)).toBe(0);
    expect(windowStartFor(60_000, 60_000)).toBe(60_000);
    expect(windowStartFor(125_000, 60_000)).toBe(120_000);
  });

  it('handles non-minute windows', () => {
    expect(windowStartFor(1_500, 1_000)).toBe(1_000);
    expect(windowStartFor(1_999, 1_000)).toBe(1_000);
  });
});

describe('limit decision', () => {
  it('allows up to the limit inclusive, then blocks', () => {
    expect(isAllowed(1, 5)).toBe(true);
    expect(isAllowed(5, 5)).toBe(true);
    expect(isAllowed(6, 5)).toBe(false);
  });

  it('blocks everything at a zero limit', () => {
    expect(isAllowed(1, 0)).toBe(false);
  });
});
