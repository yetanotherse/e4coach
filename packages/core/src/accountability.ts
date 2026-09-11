/**
 * Weekly check-in streak math (plans/phase-2.md 2.4). Weeks are Monday 00:00
 * UTC — the same weekStartFor math as training plans, so "checked in this
 * week" lines up with the plan week everywhere in the product.
 */
import { weekStartFor } from './plan/assemble.js';

export { weekStartFor };

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  /** weekStart of the most recent check-in, if any */
  lastCheckInWeekStart: Date | null;
}

/** One day in ms — the extend window is "previous week" = a 7-day gap. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The streak state after checking in during `weekStart`. Same week again is a
 * no-op (idempotent check-in); the previous week extends the streak; any
 * longer gap resets it to 1.
 */
export function nextStreakState(state: StreakState, weekStart: Date): StreakState {
  const last = state.lastCheckInWeekStart;
  if (last && last.getTime() === weekStart.getTime()) return state;

  const extendsStreak = last !== null && weekStart.getTime() - last.getTime() <= 8 * DAY_MS;
  const currentStreak = extendsStreak ? state.currentStreak + 1 : 1;
  return {
    currentStreak,
    longestStreak: Math.max(state.longestStreak, currentStreak),
    lastCheckInWeekStart: weekStart,
  };
}

/** Whether the user has already checked in during `weekStart`. */
export function hasCheckedIn(state: StreakState, weekStart: Date): boolean {
  return state.lastCheckInWeekStart?.getTime() === weekStart.getTime();
}

/**
 * Whether a weekly nudge is warranted (plans/phase-2.md 2.4): the user has not
 * checked in this week and was not already nudged this week. Pure decision —
 * the worker supplies the persisted state.
 */
export function isNudgeDue(
  lastCheckInWeekStart: Date | null,
  lastNudgeWeekStart: Date | null,
  weekStart: Date,
): boolean {
  if (hasCheckedIn({ currentStreak: 0, longestStreak: 0, lastCheckInWeekStart }, weekStart)) return false;
  return lastNudgeWeekStart?.getTime() !== weekStart.getTime();
}
