import { describe, it, expect } from 'vitest';
import {
  initialSrsState,
  isDue,
  nextSrsState,
  dueAtFor,
  pickResurfaceDrills,
  SRS_EASE_MIN,
  SRS_EASE_START,
  SRS_INTERVAL_MAX_DAYS,
} from './srs.js';

describe('initialSrsState', () => {
  it('starts new drills due immediately with no progress', () => {
    expect(initialSrsState()).toEqual({ intervalDays: 0, ease: SRS_EASE_START, reviewCount: 0 });
  });
});

describe('isDue', () => {
  it('is due at or after the due time, not before', () => {
    const now = new Date('2026-09-11T10:00:00Z');
    expect(isDue(new Date('2026-09-11T09:59:59Z'), now)).toBe(true);
    expect(isDue(new Date('2026-09-11T10:00:00Z'), now)).toBe(true);
    expect(isDue(new Date('2026-09-11T10:00:01Z'), now)).toBe(false);
  });
});

describe('nextSrsState — clean solves', () => {
  it('first clean solve schedules 1 day out', () => {
    const next = nextSrsState(initialSrsState(), { lapses: 0 });
    expect(next).toEqual({ intervalDays: 1, ease: SRS_EASE_START, reviewCount: 1 });
  });

  it('second clean solve schedules 3 days out', () => {
    const next = nextSrsState({ intervalDays: 1, ease: 2.5, reviewCount: 1 }, { lapses: 0 });
    expect(next).toEqual({ intervalDays: 3, ease: 2.5, reviewCount: 2 });
  });

  it('later solves grow the interval by ease, rounded', () => {
    const next = nextSrsState({ intervalDays: 3, ease: 2.5, reviewCount: 2 }, { lapses: 0 });
    expect(next.intervalDays).toBe(8); // round(3 × 2.5)
    expect(next.reviewCount).toBe(3);
  });

  it('caps the interval at the maximum', () => {
    const next = nextSrsState({ intervalDays: 170, ease: 2.5, reviewCount: 9 }, { lapses: 0 });
    expect(next.intervalDays).toBe(SRS_INTERVAL_MAX_DAYS);
  });
});

describe('nextSrsState — grind solves', () => {
  it('a lapse drops ease, resets progress, and schedules 1 day out', () => {
    const next = nextSrsState({ intervalDays: 12, ease: 2.5, reviewCount: 4 }, { lapses: 2 });
    expect(next).toEqual({ intervalDays: 1, ease: 2.3, reviewCount: 0 });
  });

  it('ease never drops below the floor', () => {
    const next = nextSrsState(
      { intervalDays: 5, ease: SRS_EASE_MIN, reviewCount: 3 },
      { lapses: 1 },
    );
    expect(next.ease).toBe(SRS_EASE_MIN);
  });

  it('repeated lapses keep ratcheting ease down to the floor', () => {
    let state = { intervalDays: 1, ease: 2.5, reviewCount: 1 };
    for (let i = 0; i < 10; i++) state = nextSrsState(state, { lapses: 1 });
    expect(state.ease).toBe(SRS_EASE_MIN);
    expect(state.reviewCount).toBe(0);
  });
});

describe('dueAtFor', () => {
  it('adds whole days', () => {
    expect(dueAtFor(new Date('2026-09-11T23:00:00Z'), 3).toISOString()).toBe(
      '2026-09-14T23:00:00.000Z',
    );
  });
});

describe('pickResurfaceDrills', () => {
  const due = [
    { id: 'a', theme: 'HANGING_PIECE', dueAt: new Date('2026-09-08T00:00:00Z') },
    { id: 'b', theme: 'MISSED_TACTIC', dueAt: new Date('2026-09-07T00:00:00Z') },
    { id: 'c', theme: 'HANGING_PIECE', dueAt: new Date('2026-09-10T00:00:00Z') },
    { id: 'd', theme: 'HANGING_PIECE', dueAt: new Date('2026-09-09T00:00:00Z') },
  ];

  it('selects only the requested theme, most overdue first', () => {
    expect(pickResurfaceDrills(due, 'HANGING_PIECE', new Set())).toEqual(['a', 'd', 'c']);
  });

  it('excludes drills already linked to the plan', () => {
    expect(pickResurfaceDrills(due, 'HANGING_PIECE', new Set(['a', 'd']))).toEqual(['c']);
  });

  it('respects the limit', () => {
    expect(pickResurfaceDrills(due, 'HANGING_PIECE', new Set(), 2)).toEqual(['a', 'd']);
  });

  it('returns nothing for a theme with no due drills', () => {
    expect(pickResurfaceDrills(due, 'WEAK_DEFENSE', new Set())).toEqual([]);
  });
});
