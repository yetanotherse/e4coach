import { jsonError, jsonOk, prisma } from '@/lib/server';

/** GET /api/job/:id — poll job status/stage for the progress screen (spec §13). */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const job = await prisma.analysisJob.findUnique({
    where: { id: params.id },
    include: {
      report: { select: { publicSlug: true } },
      user: { select: { lichessUser: true } },
    },
  });
  if (!job) return jsonError('Job not found', 404);

  return jsonOk({
    id: job.id,
    status: job.status,
    stage: job.stage,
    gameCount: job.gameCount,
    lichessUser: job.user.lichessUser,
    error: job.error,
    reportSlug: job.report?.publicSlug ?? null,
  });
}
