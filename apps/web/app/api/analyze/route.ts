import { analytics, env, jsonError, jsonOk, prisma } from '@/lib/server';
import { getSessionUserId } from '@/lib/auth';
import { AnalyzeSchema } from '@/lib/validation';

/**
 * POST /api/analyze — start a fresh AnalysisJob for the signed-in user
 * ("analyze new games", spec §13). The user is taken from the session, never
 * from the request body. Body may optionally pick the platform (plans/phase-2.md
 * 2.1); the user must have a username on file for that platform.
 */
export async function POST(req: Request): Promise<Response> {
  const userId = getSessionUserId();
  if (!userId) return jsonError('Not signed in', 401);

  let body: unknown = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return jsonError('Invalid JSON body', 400);
  }
  const parsed = AnalyzeSchema.safeParse(body);
  if (!parsed.success) return jsonError('Invalid source', 422);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return jsonError('User not found', 404);

  // Respect the env default (mock in dev/e2e) when no explicit pick was made.
  const jobSource = parsed.data.source ?? env.GAME_SOURCE;
  const username = jobSource === 'chesscom' ? user.chessComUser : user.lichessUser;
  if (jobSource === 'lichess' && !username) {
    return jsonError('No Lichess username on file — sign up again with it first.', 422);
  }
  if (jobSource === 'chesscom' && !username) {
    return jsonError('No Chess.com username on file — sign up again with it first.', 422);
  }

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
      data: { userId: user.id, source: jobSource, status: 'PENDING' },
    }));

  if (!active) {
    await analytics.capture(user.emailHash ?? user.id, 'reanalyze_clicked', {
      jobId: job.id,
      source: jobSource,
    });
    await analytics.capture(user.emailHash ?? user.id, 'job_started', {
      jobId: job.id,
      source: jobSource,
    });
  }
  return jsonOk({ jobId: job.id }, 201);
}
