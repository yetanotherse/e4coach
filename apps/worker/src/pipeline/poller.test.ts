import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@chess-coach/db';
import type { RunDeps } from './runner.js';
import { recoverStaleJobs } from './poller.js';

interface Row {
  id: string;
  status: string;
  attempts: number;
  updatedAt: Date;
  error?: string | null;
  stage?: string | null;
}

type Where = { id?: string; status?: { in: readonly string[] }; updatedAt?: { lt: Date } };

/** Minimal in-memory Prisma stand-in honoring the WHERE shapes recoverStaleJobs uses. */
function fakeDb(rows: Row[]) {
  const matches = (where: Where, r: Row): boolean =>
    (where.id === undefined || r.id === where.id) &&
    (where.status === undefined || where.status.in.includes(r.status)) &&
    (where.updatedAt === undefined || r.updatedAt < where.updatedAt.lt);

  const db = {
    analysisJob: {
      findMany: async ({ where }: { where: Where }) => rows.filter((r) => matches(where, r)),
      updateMany: async ({ where, data }: { where: Where; data: Partial<Row> }) => {
        let count = 0;
        for (const r of rows) {
          if (matches(where, r)) {
            Object.assign(r, data);
            count++;
          }
        }
        return { count };
      },
    },
  } as unknown as PrismaClient;
  return { db, rows };
}

const depsWith = (db: PrismaClient): RunDeps => ({ db }) as unknown as RunDeps;
const STALE = 600_000;
const now = Date.now();
const freshTs = new Date(now - 1_000);
const staleTs = new Date(now - STALE - 1_000);

describe('recoverStaleJobs', () => {
  it('requeues an in-progress job with no recent progress', async () => {
    const { db, rows } = fakeDb([
      { id: 'j1', status: 'EVALUATING', attempts: 1, updatedAt: staleTs, stage: 'x' },
    ]);
    const n = await recoverStaleJobs(depsWith(db), STALE, 3);
    expect(n).toBe(1);
    expect(rows[0]!.status).toBe('PENDING');
    expect(rows[0]!.stage).toBeNull();
  });

  it('leaves a freshly-progressing job alone (heartbeat kept updatedAt fresh)', async () => {
    const { db, rows } = fakeDb([
      { id: 'j1', status: 'EVALUATING', attempts: 1, updatedAt: freshTs },
    ]);
    const n = await recoverStaleJobs(depsWith(db), STALE, 3);
    expect(n).toBe(0);
    expect(rows[0]!.status).toBe('EVALUATING');
  });

  it('fails (does not requeue) a job that has burned through maxAttempts', async () => {
    const { db, rows } = fakeDb([
      { id: 'j1', status: 'FETCHING', attempts: 3, updatedAt: staleTs },
    ]);
    const n = await recoverStaleJobs(depsWith(db), STALE, 3);
    expect(n).toBe(1);
    expect(rows[0]!.status).toBe('FAILED');
    expect(rows[0]!.error).toContain('abandoned');
  });

  it('ignores terminal and pending jobs', async () => {
    const { db, rows } = fakeDb([
      { id: 'done', status: 'DONE', attempts: 1, updatedAt: staleTs },
      { id: 'failed', status: 'FAILED', attempts: 1, updatedAt: staleTs },
      { id: 'pending', status: 'PENDING', attempts: 0, updatedAt: staleTs },
    ]);
    const n = await recoverStaleJobs(depsWith(db), STALE, 3);
    expect(n).toBe(0);
    expect(rows.map((r) => r.status)).toEqual(['DONE', 'FAILED', 'PENDING']);
  });
});
