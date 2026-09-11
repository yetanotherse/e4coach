import { z } from 'zod';
import { env, jsonError, jsonOk, mailer, prisma, rateLimit } from '@/lib/server';
import { createMagicToken } from '@/lib/auth';
import { sendMagicLinkEmail } from '@/lib/signinEmail';

const RequestSchema = z.object({ email: z.string().trim().email().max(254) });

/**
 * POST /api/auth/request — email a magic sign-in link (spec §13). Always returns
 * ok regardless of whether the email exists, to avoid leaking account presence.
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
    const token = createMagicToken(user.id);
    const link = `${env.APP_URL}/api/auth/callback?token=${encodeURIComponent(token)}`;
    try {
      await sendMagicLinkEmail(mailer, user.email, link);
    } catch {
      /* don't reveal delivery failures to the caller */
    }
  }
  return jsonOk({ sent: true });
}
