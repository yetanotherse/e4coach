import { jsonError, jsonOk, prisma } from '@/lib/server';
import { z } from 'zod';

const DeleteSchema = z.object({ userId: z.string().min(1) });

/**
 * DELETE /api/me — delete the user and cascade all their data (spec §11.3).
 * Auth is added in Phase D; for now the user is identified by id in the body.
 */
export async function DELETE(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) return jsonError('Invalid input', 422);

  try {
    await prisma.user.delete({ where: { id: parsed.data.userId } });
  } catch {
    return jsonError('User not found', 404);
  }
  return jsonOk({ deleted: true });
}
