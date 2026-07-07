import { jsonError, jsonOk, prisma } from '@/lib/server';

/**
 * GET /api/report/:slug — fetch a rendered report by its unguessable slug and
 * increment the view count (spec §13). Public-but-unguessable; no auth.
 */
export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
): Promise<Response> {
  const report = await prisma.report.findUnique({ where: { publicSlug: params.slug } });
  if (!report) return jsonError('Report not found', 404);

  await prisma.report.update({
    where: { publicSlug: params.slug },
    data: { viewCount: { increment: 1 } },
  });

  return jsonOk({
    slug: report.publicSlug,
    content: report.content,
    profile: report.profile,
    degraded: report.degraded,
    createdAt: report.createdAt,
  });
}
