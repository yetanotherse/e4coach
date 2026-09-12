import { analytics, jsonError, jsonOk, prisma } from '@/lib/server';
import { getSessionUserId } from '@/lib/auth';

/**
 * Training-plan regeneration (retry for silently-failed plan generation).
 *
 * POST /api/plan/regenerate — enqueue a lightweight AnalysisJob (kind='plan')
 * that rebuilds this week's plan from the user's latest report. No game
 * analysis: the stored profile is the source of truth, so it completes in
 * seconds-to-minutes instead of the full pipeline.
 * GET  /api/plan/regenerate — poll progress: { queued, done } for the CTA.
 */
export async function POST(): Promise<Response> {
  const userId = getSessionUserId();
  if (!userId) return jsonError('Not signed in', 401);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return jsonError('User not found', 404);

  const report = await prisma.report.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, job: { select: { source: true } } },
  });
  if (!report) return jsonError('No report to build a plan from — analyze some games first', 422);

  // Don't stack duplicate regeneration jobs; an already-queued one will land.
  const active = await prisma.analysisJob.findFirst({
    where: {
      userId,
      kind: 'plan',
      status: { in: ['PENDING', 'FETCHING', 'CLASSIFYING', 'EVALUATING', 'GENERATING'] },
    },
  });
  const job =
    active ??
    (await prisma.analysisJob.create({
      data: { userId, source: report.job.source, kind: 'plan', status: 'PENDING' },
    }));

  if (!active) {
    await analytics.capture(user.emailHash ?? userId, 'plan_regen_requested', {
      jobId: job.id,
      reportId: report.id,
    });
  }
  return jsonOk({ jobId: job.id }, active ? 200 : 201);
}

export async function GET(): Promise<Response> {
  const userId = getSessionUserId();
  if (!userId) return jsonError('Not signed in', 401);

  const [activePlan, pendingJob] = await Promise.all([
    prisma.trainingPlan.findFirst({
      where: { userId, status: 'active' },
      select: { id: true },
    }),
    prisma.analysisJob.findFirst({
      where: {
        userId,
        kind: 'plan',
        status: { in: ['PENDING', 'FETCHING', 'CLASSIFYING', 'EVALUATING', 'GENERATING'] },
      },
      select: { id: true, status: true },
    }),
  ]);
  return jsonOk({ ready: Boolean(activePlan), pending: pendingJob ?? null });
}
