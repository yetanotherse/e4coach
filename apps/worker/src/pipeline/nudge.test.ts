import { describe, it, expect } from 'vitest';
import { MockAnalytics, MockMailer } from '@chess-coach/adapters';
import type { PrismaClient } from '@chess-coach/db';
import { sendWeeklyNudges, type NudgeOptions } from './nudge.js';

/**
 * In-memory Prisma stand-in covering only the calls sendWeeklyNudges makes.
 * Users carry their streak state; streak upserts mutate it, and findMany
 * honors the nudge-week exclusion + take so idempotency can be asserted
 * across repeated scans.
 */
function fakeDb(users: Array<Record<string, unknown>>) {
  const streaks = new Map<string, Record<string, unknown>>();
  const state = { nudged: [] as string[] };
  const db = {
    user: {
      findMany: async (args: {
        where: { OR?: Array<Record<string, unknown>> };
        take?: number;
      }) => {
        // The week being nudged about, from the where's streak exclusion.
        const orStreak = args.where.OR?.[1] as { streak?: { lastNudgeWeekStart?: { not?: Date } } } | undefined;
        const weekStart = orStreak?.streak?.lastNudgeWeekStart?.not?.getTime();
        const filtered = users.filter((u) => {
          const effective = streaks.get(u.id as string) ?? (u.streak as Record<string, unknown> | null);
          if (weekStart !== undefined && effective?.lastNudgeWeekStart instanceof Date) {
            if ((effective.lastNudgeWeekStart as Date).getTime() === weekStart) return false;
          }
          return true;
        });
        return args.take ? filtered.slice(0, args.take) : filtered;
      },
    },
    drill: {
      count: async ({ where }: { where: { userId: string } }) =>
        (users.find((u) => u.id === where.userId)?.dueDrills as number) ?? 0,
    },
    streak: {
      upsert: async ({ where, create, update }: { where: { userId: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = streaks.get(where.userId) ?? {};
        const merged = { ...existing, ...update, ...Object.fromEntries(Object.entries(create).filter(([k]) => !(k in existing))) };
        streaks.set(where.userId, merged);
        state.nudged.push(where.userId);
        return merged;
      },
    },
  } as unknown as PrismaClient;
  return { db, streaks, state };
}

const opts: NudgeOptions = { appUrl: 'http://localhost:3000', maxPerScan: 50 };
const NOW = new Date('2026-09-09T10:00:00Z'); // week of Sep 7

function user(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'u1',
    email: 'u1@example.com',
    emailHash: 'hash1',
    streak: null,
    dueDrills: 3,
    ...overrides,
  };
}

describe('sendWeeklyNudges', () => {
  it('nudges users who have not checked in and were not nudged this week', async () => {
    const { db } = fakeDb([user()]);
    const mailer = new MockMailer();
    await sendWeeklyNudges({ db, mailer, analytics: new MockAnalytics() }, opts, NOW);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe('u1@example.com');
    expect(mailer.sent[0]!.subject).toContain('week');
    expect(mailer.sent[0]!.html).toContain('/progress');
  });

  it('mentions the due-drill count in the email', async () => {
    const { db } = fakeDb([user({ dueDrills: 7 })]);
    const mailer = new MockMailer();
    await sendWeeklyNudges({ db, mailer, analytics: new MockAnalytics() }, opts, NOW);
    expect(mailer.sent[0]!.text).toContain('7 drills due');
  });

  it('skips users who already checked in this week', async () => {
    const { db } = fakeDb([
      user({ streak: { lastCheckInWeekStart: new Date('2026-09-07T00:00:00Z'), lastNudgeWeekStart: null } }),
    ]);
    const mailer = new MockMailer();
    await sendWeeklyNudges({ db, mailer, analytics: new MockAnalytics() }, opts, NOW);
    expect(mailer.sent).toHaveLength(0);
  });

  it('sends at most one nudge per user per week (idempotent across scans)', async () => {
    const { db, state } = fakeDb([user()]);
    const mailer = new MockMailer();
    const deps = { db, mailer, analytics: new MockAnalytics() };
    await sendWeeklyNudges(deps, opts, NOW);
    await sendWeeklyNudges(deps, opts, NOW); // second scan same week
    expect(mailer.sent).toHaveLength(1);
    expect(state.nudged).toHaveLength(1);
  });

  it('nudges again next week if the user still has not checked in', async () => {
    const { db } = fakeDb([user()]);
    const mailer = new MockMailer();
    const deps = { db, mailer, analytics: new MockAnalytics() };
    await sendWeeklyNudges(deps, opts, NOW);
    await sendWeeklyNudges(deps, opts, new Date('2026-09-16T10:00:00Z')); // next week
    expect(mailer.sent).toHaveLength(2);
  });

  it('respects maxPerScan', async () => {
    const { db } = fakeDb([user({ id: 'u1' }), user({ id: 'u2', email: 'u2@example.com' }), user({ id: 'u3', email: 'u3@example.com' })]);
    const mailer = new MockMailer();
    await sendWeeklyNudges({ db, mailer, analytics: new MockAnalytics() }, { ...opts, maxPerScan: 2 }, NOW);
    expect(mailer.sent).toHaveLength(2);
  });

  it('does not mark a user as nudged when the send fails', async () => {
    const { db, state } = fakeDb([user()]);
    const mailer = new MockMailer();
    mailer.send = async () => {
      throw new Error('resend down');
    };
    await sendWeeklyNudges({ db, mailer, analytics: new MockAnalytics() }, opts, NOW);
    expect(state.nudged).toHaveLength(0); // retried next scan
  });
});
