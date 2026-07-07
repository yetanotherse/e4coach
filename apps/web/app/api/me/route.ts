import { jsonError, jsonOk, prisma } from '@/lib/server';
import { clearSession, getSessionUserId } from '@/lib/auth';

/**
 * DELETE /api/me — delete the signed-in user and cascade all their data
 * (spec §11.3). The user is taken from the session.
 */
export async function DELETE(): Promise<Response> {
  const userId = getSessionUserId();
  if (!userId) return jsonError('Not signed in', 401);

  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch {
    return jsonError('User not found', 404);
  }
  clearSession();
  return jsonOk({ deleted: true });
}
