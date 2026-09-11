import { describe, it, expect } from 'vitest';
import { nextStreakState, hasCheckedIn, isNudgeDue, weekStartFor } from './accountability.js';

const mon = (iso: string) => weekStartFor(new Date(iso));
// 2026-09-07, 2026-08-31, 2026-08-24 are Mondays.
const W1 = mon('2026-09-09T15:00:00Z'); // week of Sep 7
const W0 = mon('2026-09-02T15:00:00Z'); // week of Aug 31
const W_1 = mon('2026-08-26T15:00:00Z'); // week of Aug 24

describe('nextStreakState', () => {
  it('first-ever check-in starts a streak of 1', () => {
    const next = nextStreakState({ currentStreak: 0, longestStreak: 0, lastCheckInWeekStart: null }, W1);
    expect(next).toEqual({ currentStreak: 1, longestStreak: 1, lastCheckInWeekStart: W1 });
  });

  it('checking in the week after last week extends the streak', () => {
    const next = nextStreakState({ currentStreak: 3, longestStreak: 5, lastCheckInWeekStart: W0 }, W1);
    expect(next.currentStreak).toBe(4);
    expect(next.longestStreak).toBe(5);
    expect(next.lastCheckInWeekStart).toBe(W1);
  });

  it('a gap of 2+ weeks resets the streak to 1', () => {
    const next = nextStreakState({ currentStreak: 6, longestStreak: 6, lastCheckInWeekStart: W_1 }, W1);
    expect(next.currentStreak).toBe(1);
    expect(next.longestStreak).toBe(6);
  });

  it('re-checking-in the same week is a no-op (idempotent)', () => {
    const state = { currentStreak: 4, longestStreak: 9, lastCheckInWeekStart: W1 };
    expect(nextStreakState(state, W1)).toBe(state);
  });

  it('longestStreak grows when the current streak passes it', () => {
    const next = nextStreakState({ currentStreak: 4, longestStreak: 4, lastCheckInWeekStart: W0 }, W1);
    expect(next.currentStreak).toBe(5);
    expect(next.longestStreak).toBe(5);
  });
});

describe('hasCheckedIn', () => {
  it('is true only for the exact week', () => {
    const state = { currentStreak: 1, longestStreak: 1, lastCheckInWeekStart: W0 };
    expect(hasCheckedIn(state, W0)).toBe(true);
    expect(hasCheckedIn(state, W1)).toBe(false);
    expect(hasCheckedIn({ currentStreak: 0, longestStreak: 0, lastCheckInWeekStart: null }, W1)).toBe(false);
  });
});

describe('isNudgeDue', () => {
  it('is due when the user has not checked in and was not nudged this week', () => {
    expect(isNudgeDue(W_1, null, W1)).toBe(true);
    expect(isNudgeDue(null, null, W1)).toBe(true);
  });

  it('is not due when already checked in this week', () => {
    expect(isNudgeDue(W1, null, W1)).toBe(false);
  });

  it('is not due when already nudged this week (even if not checked in)', () => {
    expect(isNudgeDue(W_1, W1, W1)).toBe(false);
  });

  it('is due again next week after a previous-week nudge with no check-in', () => {
    expect(isNudgeDue(W_1, W0, W1)).toBe(true);
  });
});
