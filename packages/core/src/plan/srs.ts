/**
 * SM-2-lite spaced repetition for drills (plans/phase-2.md 2.3). A
 * deliberately small subset of SM-2: an easiness factor, a growing interval,
 * and a reset on lapse. The drill owns its state (interval, ease, dueAt,
 * reviewCount) so reviews schedule across weeks regardless of which plan
 * linked the drill.
 *
 * Scheduling happens on the SOLVE attempt only: wrong tries are recorded as
 * attempts but the eventual solve factors them in as `lapses` (failed tries
 * since the previous successful review). A clean solve extends the interval;
 * a grind-out solve (any lapse) penalizes ease and resets progress, SM-2 style.
 */
import type { WeaknessCategory } from '../taxonomy.js';

export const SRS_EASE_START = 2.5;
export const SRS_EASE_MIN = 1.3;
export const SRS_EASE_STEP = 0.2;
/** Cap so intervals stay meaningful for a weekly-coaching cadence. */
export const SRS_INTERVAL_MAX_DAYS = 180;

/** The scheduling state carried on a Drill row. */
export interface SrsState {
  intervalDays: number;
  ease: number;
  reviewCount: number;
}

/** One completed review: the solve plus how hard it was. */
export interface SrsReview {
  /** failed attempts since the previous successful review (0 = clean solve) */
  lapses: number;
}

/** Fresh drill state: never reviewed, due immediately. */
export function initialSrsState(): SrsState {
  return { intervalDays: 0, ease: SRS_EASE_START, reviewCount: 0 };
}

export function isDue(dueAt: Date, now: Date): boolean {
  return dueAt.getTime() <= now.getTime();
}

/**
 * Advance the SRS state after a completed review.
 * - Clean solve: 1st success → 1 day, 2nd → 3 days, then interval × ease,
 *   capped at SRS_INTERVAL_MAX_DAYS.
 * - Grind solve (≥1 lapse since the last review): ease drops by
 *   SRS_EASE_STEP (floored at SRS_EASE_MIN), progress resets, and the drill
 *   comes back in 1 day.
 */
export function nextSrsState(state: SrsState, review: SrsReview): SrsState {
  if (review.lapses > 0) {
    return {
      intervalDays: 1,
      ease: Math.max(SRS_EASE_MIN, state.ease - SRS_EASE_STEP),
      reviewCount: 0,
    };
  }
  const reviewCount = state.reviewCount + 1;
  const intervalDays =
    reviewCount === 1
      ? 1
      : reviewCount === 2
        ? 3
        : Math.min(SRS_INTERVAL_MAX_DAYS, Math.round(state.intervalDays * state.ease));
  return { intervalDays, ease: state.ease, reviewCount };
}

/** `now` shifted by `days` calendar days (UTC-safe for date-only intervals). */
export function dueAtFor(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

/** A due drill reference for resurfacing selection (worker plan generation). */
export interface DueDrillRef {
  id: string;
  theme: WeaknessCategory | string;
  dueAt: Date;
}

/**
 * Pick already-due drills of `theme` to resurface in a new weekly plan
 * (plans/phase-2.md 2.3): most-overdue first, excluding drills the plan
 * already links (fresh draft drills), up to `limit`.
 */
export function pickResurfaceDrills(
  due: readonly DueDrillRef[],
  theme: string,
  exclude: ReadonlySet<string>,
  limit = 3,
): string[] {
  return due
    .filter((d) => d.theme === theme && !exclude.has(d.id))
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
    .slice(0, limit)
    .map((d) => d.id);
}
