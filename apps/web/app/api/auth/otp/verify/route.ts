import { z } from 'zod';
import { env, jsonError, jsonOk, prisma, rateLimit } from '@/lib/server';
import { otpMatches } from '@/lib/otp';
import { setSession } from '@/lib/auth';

const VerifySchema = z.object({
  email: z.string().trim().email().max(254),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});

const MAX_VERIFY_ATTEMPTS = 5;
const GENERIC_ERROR = 'Invalid or expired code.';

/**
 * POST /api/auth/otp/verify — check the emailed 6-digit code and start a
 * 30-day session (plans/phase-2.md 2.0.2). Single-use, expiry-checked, and
 * dead after MAX_VERIFY_ATTEMPTS wrong tries.
 */
export async function POST(req: Request): Promise<Response> {
  if (!(await rateLimit(req, 'auth'))) {
    return jsonError('Too many requests. Please try again in a minute.', 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }
  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) return jsonError(GENERIC_ERROR, 422);
  const { email, code } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return jsonError(GENERIC_ERROR, 401);

  const challenge = await prisma.authChallenge.findFirst({
    where: { userId: user.id, kind: 'otp', consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge || challenge.attempts >= MAX_VERIFY_ATTEMPTS) {
    return jsonError(GENERIC_ERROR, 401);
  }

  if (!otpMatches(env.AUTH_SECRET, user.email, code, challenge.codeHash)) {
    await prisma.authChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    return jsonError(GENERIC_ERROR, 401);
  }

  await prisma.authChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });
  setSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  return jsonOk({ signedIn: true });
}
