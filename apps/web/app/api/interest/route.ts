import { InterestSchema } from '@/lib/validation';
import { analytics, jsonError, jsonOk, prisma, rateLimit } from '@/lib/server';
import { hashEmail } from '@/lib/hash';

/**
 * POST /api/interest — fake-door WTP signal (spec §13, §15). Records the click
 * in the DB and PostHog. Anonymous-friendly: userId is optional.
 */
export async function POST(req: Request): Promise<Response> {
  if (!(await rateLimit(req, 'track'))) {
    return jsonError('Too many requests. Please try again in a minute.', 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }
  const parsed = InterestSchema.safeParse(body);
  if (!parsed.success) return jsonError('Invalid input', 422);

  const { tier, reportSlug, email: formEmail } = parsed.data;

  // A report-page click is attributable to the signed-up user (contactable via
  // their email); a homepage click provides its own email (the waitlist form).
  const reportUser = reportSlug
    ? (
        await prisma.report.findUnique({
          where: { publicSlug: reportSlug },
          select: { user: { select: { id: true, email: true } } },
        })
      )?.user
    : null;

  const userId = reportUser?.id ?? null;
  const email = reportUser?.email ?? formEmail ?? null;

  await prisma.interest.create({ data: { tier, userId, email } });
  const distinctId = userId ?? (email ? hashEmail(email) : 'anonymous');
  await analytics.capture(distinctId, 'interest_clicked', { tier, hasEmail: Boolean(email) });

  return jsonOk({ recorded: true }, 201);
}
