import { dbFingerprint } from '@chess-coach/config';
import { SignupSchema } from '@/lib/validation';
import { analytics, env, jsonError, jsonOk, prisma } from '@/lib/server';
import { hashEmail } from '@/lib/hash';

/**
 * POST /api/signup — create/lookup the user, record consent, and enqueue an
 * AnalysisJob the worker will pick up (spec §13). Returns the job id so the
 * client can poll the progress screen.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Invalid input', 422);
  }
  const { email, lichessUser, maxGames, perfTypes } = parsed.data;
  const emailHash = hashEmail(email);
  const source = env.GAME_SOURCE;
  const params =
    maxGames || perfTypes
      ? { ...(maxGames ? { maxGames } : {}), ...(perfTypes ? { perfTypes } : {}) }
      : undefined;

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, emailHash, lichessUser, consentAt: new Date() },
    update: { lichessUser, emailHash, consentAt: new Date(), lastSeenAt: new Date() },
  });

  // Avoid piling up duplicate jobs if the user resubmits while one is running.
  const active = await prisma.analysisJob.findFirst({
    where: { userId: user.id, status: { in: ['PENDING', 'FETCHING', 'EVALUATING', 'CLASSIFYING', 'GENERATING'] } },
    orderBy: { createdAt: 'desc' },
  });
  const job =
    active ??
    (await prisma.analysisJob.create({
      data: { userId: user.id, source, status: 'PENDING', ...(params ? { params } : {}) },
    }));

  // Surface which DB this job landed in — compare to the worker's boot
  // dbFingerprint if the job never gets processed (mismatch = different DBs).
  console.log(`[signup] job ${job.id} created (source=${source}, db ${dbFingerprint(env.DATABASE_URL)})`);

  await analytics.capture(emailHash, 'signup_completed', { source });
  if (!active) await analytics.capture(emailHash, 'job_started', { jobId: job.id, source });

  return jsonOk({ jobId: job.id, userId: user.id }, 201);
}
