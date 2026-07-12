import { dbFingerprint } from '@chess-coach/config';
import { env, jsonError, jsonOk, prisma } from '@/lib/server';

// Always hit the DB — never cache this.
export const dynamic = 'force-dynamic';

/**
 * GET /api/health — cheap liveness + which-database check. The `dbFingerprint`
 * is a one-way hash of DATABASE_URL (no secrets), so comparing it to the
 * worker's boot log answers "are the web app and worker on the same database?"
 * in one glance. If a job is created here but the worker never runs it, mismatched
 * fingerprints are the cause.
 */
export async function GET(): Promise<Response> {
  try {
    const [pending, total] = await Promise.all([
      prisma.analysisJob.count({ where: { status: 'PENDING' } }),
      prisma.analysisJob.count(),
    ]);
    return jsonOk({ dbFingerprint: dbFingerprint(env.DATABASE_URL), pending, total });
  } catch (err) {
    // DB unreachable — surface the fingerprint so the target is still visible.
    return jsonError(
      `database unreachable (db ${dbFingerprint(env.DATABASE_URL)}): ${err instanceof Error ? err.message : 'unknown error'}`,
      503,
    );
  }
}
