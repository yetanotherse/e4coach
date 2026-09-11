import { dbFingerprint } from '@chess-coach/config';
import { SignupSchema } from '@/lib/validation';
import { analytics, env, jsonError, jsonOk, mailer, prisma, rateLimit } from '@/lib/server';
import { hashEmail } from '@/lib/hash';
import { createMagicToken } from '@/lib/auth';
import { sendMagicLinkEmail } from '@/lib/signinEmail';

/**
 * POST /api/signup — create/lookup the user, record consent, and enqueue an
 * AnalysisJob the worker will pick up (spec §13). Returns the job id so the
 * client can poll the progress screen. Also emails a magic sign-in link so the
 * user gets a real session without a separate login step (plans/phase-2.md 2.0.1).
 */
export async function POST(req: Request): Promise<Response> {
  if (!(await rateLimit(req, 'signup'))) {
    return jsonError('Too many requests. Please try again in a minute.', 429);
  }

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
    where: {
      userId: user.id,
      status: { in: ['PENDING', 'FETCHING', 'EVALUATING', 'CLASSIFYING', 'GENERATING'] },
    },
    orderBy: { createdAt: 'desc' },
  });
  const job =
    active ??
    (await prisma.analysisJob.create({
      data: { userId: user.id, source, status: 'PENDING', ...(params ? { params } : {}) },
    }));

  // Surface which DB this job landed in — compare to the worker's boot
  // dbFingerprint if the job never gets processed (mismatch = different DBs).
  // "reused" means an active job already existed (de-dup), so no new PENDING
  // row was created — worth distinguishing when debugging "nothing happens".
  console.log(
    `[signup] job ${job.id} ${active ? 'reused' : 'queued'} (source=${source}, db ${dbFingerprint(env.DATABASE_URL)})`,
  );

  await analytics.capture(emailHash, 'signup_completed', { source });
  if (!active) await analytics.capture(emailHash, 'job_started', { jobId: job.id, source });

  // Sign-in email, fire-and-forget: analysis continues even if Resend hiccups,
  // and delivery failures must not block the 201 the client is polling on.
  try {
    const token = createMagicToken(user.id);
    const link = `${env.APP_URL}/api/auth/callback?token=${encodeURIComponent(token)}`;
    await sendMagicLinkEmail(
      mailer,
      user.email,
      link,
      'Your e4coach sign-in link (report is being analyzed)',
    );
  } catch (err) {
    console.warn('[signup] sign-in email failed:', err);
  }

  return jsonOk({ jobId: job.id, userId: user.id }, 201);
}
