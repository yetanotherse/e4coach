import { analytics, env, jsonError, jsonOk, prisma } from '@/lib/server';
import { getSessionUserId } from '@/lib/auth';

/**
 * POST /api/analyze — start a fresh AnalysisJob for the signed-in user
 * ("analyze new games", spec §13). The user is taken from the session, never
 * from the request body.
 */
export async function POST(): Promise<Response> {
  const userId = getSessionUserId();
  if (!userId) return jsonError('Not signed in', 401);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return jsonError('User not found', 404);

  // Don't stack duplicate active jobs.
  const active = await prisma.analysisJob.findFirst({
    where: {
      userId: user.id,
      status: { in: ['PENDING', 'FETCHING', 'EVALUATING', 'CLASSIFYING', 'GENERATING'] },
    },
  });
  const job =
    active ??
    (await prisma.analysisJob.create({
      data: { userId: user.id, source: env.GAME_SOURCE, status: 'PENDING' },
    }));

  if (!active) {
    await analytics.capture(user.emailHash ?? user.id, 'reanalyze_clicked', { jobId: job.id });
    await analytics.capture(user.emailHash ?? user.id, 'job_started', { jobId: job.id });
  }
  return jsonOk({ jobId: job.id }, 201);
}
