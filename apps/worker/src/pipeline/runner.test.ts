import { describe, it, expect } from 'vitest';
import {
  MockGameSource,
  MockEngine,
  MockLlmProvider,
  MockAnalytics,
  MockMailer,
  MOCK_GAMES,
} from '@chess-coach/adapters';
import type { PrismaClient } from '@chess-coach/db';
import { runJob, type RunDeps } from './runner.js';

/**
 * Minimal in-memory stand-in for the Prisma client covering only the calls the
 * runner makes. Lets us exercise the full pipeline (parse → evaluate → classify
 * → aggregate → generate → persist) with zero infrastructure.
 */
function fakeDb() {
  const state = {
    jobUpdates: [] as Array<Record<string, unknown>>,
    reports: [] as Array<Record<string, unknown>>,
  };
  const db = {
    analysisJob: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.jobUpdates.push(data);
        return data;
      },
    },
    report: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.reports.push(data);
        return data;
      },
    },
  } as unknown as PrismaClient;
  return { db, state };
}

function makeDeps(db: PrismaClient, over: Partial<RunDeps> = {}): RunDeps {
  return {
    db,
    gameSource: new MockGameSource(),
    engine: new MockEngine(),
    llm: new MockLlmProvider(),
    analytics: new MockAnalytics(),
    mailer: new MockMailer(),
    appUrl: 'http://localhost:3000',
    maxGames: 20,
    movetimeMs: 150,
    ...over,
  };
}

const user = { id: 'u1', email: 'u1@example.com', emailHash: 'hash1', lichessUser: 'mockuser' };
const job = { id: 'j1', userId: 'u1', source: 'mock' };

describe('runJob (full pipeline on mocks)', () => {
  it('produces a persisted report and marks the job DONE', async () => {
    const { db, state } = fakeDb();
    const analytics = new MockAnalytics();
    const slug = await runJob(job, user, makeDeps(db, { analytics }));

    expect(slug).toBeTruthy();
    expect(state.reports).toHaveLength(1);
    const report = state.reports[0]!;
    expect(report.publicSlug).toBe(slug);
    expect(report.profile).toBeTruthy();
    expect(report.content).toBeTruthy();

    // Job walked through the stages and finished DONE.
    const statuses = state.jobUpdates.map((u) => u.status).filter(Boolean);
    expect(statuses).toContain('FETCHING');
    expect(statuses).toContain('EVALUATING');
    expect(statuses).toContain('CLASSIFYING');
    expect(statuses).toContain('GENERATING');
    expect(statuses[statuses.length - 1]).toBe('DONE');

    expect(analytics.events.some((e) => e.event === 'job_completed')).toBe(true);
  });

  it('isolates a single malformed game instead of failing the batch', async () => {
    const badGame = { ...MOCK_GAMES[0]!, id: 'bad', pgn: '1. e4 e5 2. Zz9 ??' };
    const source = new MockGameSource([badGame, MOCK_GAMES[1]!]);
    const { db, state } = fakeDb();
    const slug = await runJob(job, user, makeDeps(db, { gameSource: source }));

    expect(slug).toBeTruthy(); // still produced a report
    const doneUpdate = state.jobUpdates.find((u) => u.status === 'DONE')!;
    expect((doneUpdate.engineMeta as { skipped: number }).skipped).toBe(1);
  });

  it('marks the job FAILED when the user has no lichess username', async () => {
    const { db, state } = fakeDb();
    const analytics = new MockAnalytics();
    await expect(
      runJob(job, { ...user, lichessUser: null }, makeDeps(db, { analytics })),
    ).rejects.toThrow();
    const last = state.jobUpdates[state.jobUpdates.length - 1]!;
    expect(last.status).toBe('FAILED');
    expect(analytics.events.some((e) => e.event === 'job_failed')).toBe(true);
  });
});
