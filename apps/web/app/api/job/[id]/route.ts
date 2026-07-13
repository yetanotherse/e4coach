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

  // While the job is still waiting, tell the user how many jobs are ahead of it
  // and whether the worker is currently busy, so they know it's queued (not
  // stuck). The worker claims PENDING jobs FIFO by createdAt, so counting
  // earlier PENDING jobs gives an honest "ahead of you" figure that ticks down.
  // Only computed for PENDING — no extra queries once the job is in-progress.
  let queueAhead = 0;
  let workerBusy = false;
  if (job.status === 'PENDING') {
    const [ahead, inProgress] = await Promise.all([
      prisma.analysisJob.count({
        where: { status: 'PENDING', createdAt: { lt: job.createdAt } },
      }),
      prisma.analysisJob.count({
        where: { status: { in: ['FETCHING', 'EVALUATING', 'CLASSIFYING', 'GENERATING'] } },
      }),
    ]);
    queueAhead = ahead;
    workerBusy = inProgress > 0;
  }

  return jsonOk({
    id: job.id,
    status: job.status,
    stage: job.stage,
    gameCount: job.gameCount,
    // PGN uploads aren't tied to an account (and the row may carry a stale
    // lichessUser from an earlier flow) — show "your games" instead.
    lichessUser: job.source === 'pgn' ? null : job.user.lichessUser,
    error: job.error,
    reportSlug: job.report?.publicSlug ?? null,
    queueAhead,
    workerBusy,
  });
}
