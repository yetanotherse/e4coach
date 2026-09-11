import { z } from 'zod';
import { analytics, jsonError, jsonOk, prisma } from '@/lib/server';
import { getSessionUserId } from '@/lib/auth';

const AttemptSchema = z.object({
  solved: z.boolean(),
  playedUci: z.string().min(4).max(5).optional(),
  timeSpentMs: z.coerce.number().int().positive().max(3_600_000).optional(),
});

/**
 * POST /api/drills/:id/attempt — record one solve attempt (plans/phase-2.md
 * 2.2a). The drill must belong to the signed-in user; the session provides the
 * user, never the body.
 */
export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const userId = getSessionUserId();
  if (!userId) return jsonError('Not signed in', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }
  const parsed = AttemptSchema.safeParse(body);
  if (!parsed.success) return jsonError('Invalid attempt data', 422);

  const drill = await prisma.drill.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true, theme: true },
  });
  if (!drill || drill.userId !== userId) return jsonError('Drill not found', 404);

  const { solved, playedUci, timeSpentMs } = parsed.data;
  await prisma.drillAttempt.create({
    data: { drillId: drill.id, userId, solved, ...(playedUci ? { playedUci } : {}), ...(timeSpentMs ? { timeSpentMs } : {}) },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailHash: true },
  });
  const distinctId = user?.emailHash ?? userId;
  await analytics.capture(distinctId, solved ? 'drill_solved' : 'drill_attempted', {
    drillId: drill.id,
    theme: drill.theme,
    ...(playedUci ? { playedUci } : {}),
    ...(timeSpentMs ? { timeSpentMs } : {}),
  });

  return jsonOk({ recorded: true }, 201);
}
