import { z } from 'zod';
import { env, jsonError, jsonOk, mailer, prisma } from '@/lib/server';
import { createMagicToken } from '@/lib/auth';

const RequestSchema = z.object({ email: z.string().trim().email().max(254) });

/**
 * POST /api/auth/request — email a magic sign-in link (spec §13). Always returns
 * ok regardless of whether the email exists, to avoid leaking account presence.
 */
export async function POST(req: Request): Promise<Response> {
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
      await mailer.send({
        to: user.email,
        subject: 'Your e4coach sign-in link',
        html: `<p>Click to sign in and see your reports:</p>
               <p><a href="${link}">Sign in to e4coach</a></p>
               <p style="color:#666;font-size:13px">This link expires in 15 minutes.</p>`,
        text: `Sign in to e4coach: ${link}`,
      });
    } catch {
      /* don't reveal delivery failures to the caller */
    }
  }
  return jsonOk({ sent: true });
}
