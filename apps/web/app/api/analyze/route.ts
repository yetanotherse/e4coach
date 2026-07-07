import { AnalyzeSchema } from '@/lib/validation';
import { analytics, env, jsonError, jsonOk, prisma } from '@/lib/server';

/**
 * POST /api/analyze — start a fresh AnalysisJob for an existing user
 * ("analyze new games", spec §13). Auth is added in Phase D; for now the user
 * is identified by id.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }
  const parsed = AnalyzeSchema.safeParse(body);
  if (!parsed.success) return jsonError('Invalid input', 422);

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!user) return jsonError('User not found', 404);

  const job = await prisma.analysisJob.create({
    data: { userId: user.id, source: env.GAME_SOURCE, status: 'PENDING' },
  });
  await analytics.capture(user.emailHash ?? user.id, 'reanalyze_clicked', { jobId: job.id });
  await analytics.capture(user.emailHash ?? user.id, 'job_started', { jobId: job.id });

  return jsonOk({ jobId: job.id }, 201);
}
