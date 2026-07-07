import { env, prisma } from '@/lib/server';
import { setSession, verifyToken } from '@/lib/auth';

/**
 * GET /api/auth/callback?token=... — verify the magic token, start a session,
 * and redirect to the dashboard (spec §13). Invalid/expired tokens bounce home.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  const userId = verifyToken(token);
  if (!userId) {
    return Response.redirect(`${env.APP_URL}/dashboard?error=invalid_link`, 303);
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    return Response.redirect(`${env.APP_URL}/dashboard?error=invalid_link`, 303);
  }
  setSession(userId);
  await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });
  return Response.redirect(`${env.APP_URL}/dashboard`, 303);
}
