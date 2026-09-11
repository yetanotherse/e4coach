import { z } from 'zod';
import { env, jsonError, jsonOk, mailer, prisma, rateLimit } from '@/lib/server';
import { generateOtpCode, hashOtpCode } from '@/lib/otp';
import { sendOtpEmail } from '@/lib/signinEmail';

const RequestSchema = z.object({ email: z.string().trim().email().max(254) });

const OTP_TTL_MS = 10 * 60 * 1000;

/**
 * POST /api/auth/otp/request — email a single-use 6-digit code (plans/phase-2.md
 * 2.0.2). Always returns ok regardless of whether the email exists, matching the
 * magic-link route's enumeration-safe behavior.
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
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return jsonError('Invalid email', 422);

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (user) {
    // One live code per user: requesting again invalidates the previous one.
    await prisma.authChallenge.deleteMany({
      where: { userId: user.id, kind: 'otp', consumedAt: null },
    });
    const code = generateOtpCode();
    await prisma.authChallenge.create({
      data: {
        userId: user.id,
        kind: 'otp',
        codeHash: hashOtpCode(env.AUTH_SECRET, user.email, code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    try {
      await sendOtpEmail(mailer, user.email, code);
    } catch {
      /* don't reveal delivery failures to the caller */
    }
  }
  return jsonOk({ sent: true });
}
