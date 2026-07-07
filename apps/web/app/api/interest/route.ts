import { InterestSchema } from '@/lib/validation';
import { analytics, jsonError, jsonOk, prisma } from '@/lib/server';

/**
 * POST /api/interest — fake-door WTP signal (spec §13, §15). Records the click
 * in the DB and PostHog. Anonymous-friendly: userId is optional.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }
  const parsed = InterestSchema.safeParse(body);
  if (!parsed.success) return jsonError('Invalid input', 422);

  const { tier, reportSlug } = parsed.data;
  const userId = reportSlug
    ? (await prisma.report.findUnique({ where: { publicSlug: reportSlug }, select: { userId: true } }))
        ?.userId
    : undefined;

  await prisma.interest.create({ data: { tier, userId: userId ?? null } });
  await analytics.capture(userId ?? 'anonymous', 'interest_clicked', { tier });

  return jsonOk({ recorded: true }, 201);
}
