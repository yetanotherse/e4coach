import { dbFingerprint } from '@chess-coach/config';
import { SignupSchema } from '@/lib/validation';
import {
  analytics,
  env,
  jsonError,
  jsonOk,
  mailer,
  prisma,
  rateLimit,
  ratingChessCom,
  ratingLichess,
} from '@/lib/server';
import { hashEmail } from '@/lib/hash';
import { createMagicToken } from '@/lib/auth';
import { sendMagicLinkEmail } from '@/lib/signinEmail';
import { snapshotRatings } from '@/lib/ratingSnapshots';

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
  const { email, lichessUser, chessComUser, source, maxGames, perfTypes } = parsed.data;
  const platform = source ?? 'lichess';
  const emailHash = hashEmail(email);
  // Explicit user choice wins; otherwise the env default (mock in dev/e2e).
  const jobSource = source ?? env.GAME_SOURCE;
  const params =
    maxGames || perfTypes
      ? { ...(maxGames ? { maxGames } : {}), ...(perfTypes ? { perfTypes } : {}) }
      : undefined;

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      emailHash,
      lichessUser,
      chessComUser,
      consentAt: new Date(),
    },
    update: {
      ...(platform === 'lichess' && lichessUser ? { lichessUser } : {}),
      ...(platform === 'chesscom' && chessComUser ? { chessComUser } : {}),
      emailHash,
      consentAt: new Date(),
      lastSeenAt: new Date(),
    },
  });

  // First rating snapshot as soon as a username exists: snapshots used to wait
  // for the next check-in, which could be a week away. Fire-and-forget — the
  // snapshot is best-effort by design and must not delay the job response.
  void snapshotRatings(prisma, user.id, [
    { source: 'lichess', username: user.lichessUser, provider: ratingLichess },
    { source: 'chesscom', username: user.chessComUser, provider: ratingChessCom },
  ]).catch(() => undefined);

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
      data: { userId: user.id, source: jobSource, status: 'PENDING', ...(params ? { params } : {}) },
    }));

  // Surface which DB this job landed in — compare to the worker's boot
  // dbFingerprint if the job never gets processed (mismatch = different DBs).
  // "reused" means an active job already existed (de-dup), so no new PENDING
  // row was created — worth distinguishing when debugging "nothing happens".
  console.log(
    `[signup] job ${job.id} ${active ? 'reused' : 'queued'} (source=${jobSource}, db ${dbFingerprint(env.DATABASE_URL)})`,
  );

  await analytics.capture(emailHash, 'signup_completed', { source: jobSource });
  if (!active) await analytics.capture(emailHash, 'job_started', { jobId: job.id, source: jobSource });

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
