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
function fakeDb(gameRows: Array<Record<string, unknown>> = []) {
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
    game: {
      findMany: async () => gameRows,
    },
    // Plan generation's puzzle fetch is best-effort; give it a quiet empty table.
    puzzle: {
      count: async () => 0,
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
    maxAnalyzed: 100,
    maxExamples: 10,
    depth: 12,
    movetimeMs: 150,
    ...over,
  };
}

const user = {
  id: 'u1',
  email: 'u1@example.com',
  emailHash: 'hash1',
  lichessUser: 'mockuser',
  chessComUser: null,
};
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

  it('study source loads pre-stored games and embeds referenced PGNs', async () => {
    const gameRow = {
      externalId: 'study1',
      pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O',
      white: 'mockuser',
      black: 'opp',
      userColor: 'white',
      result: '*',
      timeControl: '60+0',
      speed: 'bullet',
      playedAt: new Date('2026-06-01T00:00:00Z'),
    };
    const { db, state } = fakeDb([gameRow]);
    const studyJob = { id: 'j2', userId: 'u1', source: 'lichess-study' };
    const slug = await runJob(studyJob, user, makeDeps(db));

    expect(slug).toBeTruthy();
    const report = state.reports[0]!;
    const content = report.content as { games?: Record<string, unknown> };
    // Referenced games are embedded for the in-app stepper when any example fired.
    expect(content.games).toBeDefined();
  });

  it('pgn source runs with no lichess username and embeds referenced PGNs', async () => {
    const gameRow = {
      externalId: 'pgn-123',
      pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O',
      white: 'Alice',
      black: 'Bob',
      userColor: 'white',
      result: '*',
      timeControl: '600+5',
      speed: 'rapid',
      playedAt: new Date('2026-06-01T00:00:00Z'),
    };
    const { db, state } = fakeDb([gameRow]);
    const pgnJob = { id: 'j3', userId: 'u1', source: 'pgn' };
    // No lichessUser — PGN uploads have no Lichess account.
    const slug = await runJob(pgnJob, { ...user, lichessUser: null }, makeDeps(db));

    expect(slug).toBeTruthy();
    const doneUpdate = state.jobUpdates.find((u) => u.status === 'DONE');
    expect(doneUpdate).toBeDefined();
    const content = state.reports[0]!.content as {
      games?: Record<string, { speed?: string; timeControl?: string }>;
    };
    expect(content.games).toBeDefined();
    // The per-game time-control badge data is carried onto embedded games.
    const embedded = Object.values(content.games!);
    expect(embedded.some((g) => g.speed === 'rapid')).toBe(true);
  });

  it('chesscom source fetches via chessComSource with the chess.com username', async () => {
    const fetched: string[] = [];
    const source = new MockGameSource(MOCK_GAMES);
    const realFetch = source.fetchRecentGames.bind(source);
    source.fetchRecentGames = (username, opts) => {
      fetched.push(username);
      return realFetch(username, opts);
    };
    const { db, state } = fakeDb();
    const ccJob = { id: 'j4', userId: 'u1', source: 'chesscom' };
    const slug = await runJob(
      ccJob,
      { ...user, lichessUser: null, chessComUser: 'ccuser' },
      makeDeps(db, { chessComSource: source }),
    );

    expect(slug).toBeTruthy();
    expect(fetched).toEqual(['ccuser']);
    expect(state.jobUpdates.find((u) => u.status === 'DONE')).toBeDefined();
  });

  it('marks the job FAILED for chesscom without a chess.com username', async () => {
    const { db, state } = fakeDb();
    const ccJob = { id: 'j5', userId: 'u1', source: 'chesscom' };
    await expect(
      runJob(ccJob, { ...user, chessComUser: null }, makeDeps(db)),
    ).rejects.toThrow('user has no chess.com username');
    expect(state.jobUpdates[state.jobUpdates.length - 1]!.status).toBe('FAILED');
  });

  it('marks the job FAILED for chesscom when the source is not configured', async () => {
    const { db, state } = fakeDb();
    const ccJob = { id: 'j6', userId: 'u1', source: 'chesscom' };
    await expect(
      runJob(ccJob, { ...user, chessComUser: 'ccuser' }, makeDeps(db)),
    ).rejects.toThrow('chess.com game source not configured');
    expect(state.jobUpdates[state.jobUpdates.length - 1]!.status).toBe('FAILED');
  });
});
