import { parsePgnUpload } from '@chess-coach/core';
import { PgnCreateSchema } from '@/lib/validation';
import { analytics, jsonError, jsonOk, prisma } from '@/lib/server';
import { hashEmail } from '@/lib/hash';

const SOURCE = 'pgn';

/**
 * POST /api/import/pgn/create — the mapped-games submit for the PGN upload flow.
 * Orientation (userColor) and time control (speed) come from the user; all
 * other game metadata is rebuilt server-side from the PGN so a tampered client
 * payload can't inject bogus values. Creates the user, a `pgn` job, and the
 * pre-stored Game rows the worker loads (mirrors the study callback).
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const parsed = PgnCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Invalid input', 422);
  }
  const { email, games } = parsed.data;

  // Rebuild each game's metadata from its PGN (authoritative), keeping only the
  // user's orientation + time-control choices. Reject if any game no longer parses.
  const rows: {
    externalId: string;
    pgn: string;
    white: string;
    black: string;
    userColor: string;
    result: string;
    timeControl: string;
    speed: string | null;
    playedAt: Date;
  }[] = [];
  for (const g of games) {
    const preview = parsePgnUpload(g.pgn, { max: 1 }).games[0];
    if (!preview) {
      return jsonError('One of the games could not be read. Please re-upload and try again.', 422);
    }
    rows.push({
      externalId: preview.id,
      pgn: preview.pgn,
      white: preview.white,
      black: preview.black,
      userColor: g.userColor,
      result: preview.result,
      timeControl: preview.timeControl,
      speed: g.speed ?? null,
      playedAt: new Date(preview.playedAt),
    });
  }

  const emailHash = hashEmail(email);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, emailHash, consentAt: new Date() },
    update: { emailHash, consentAt: new Date(), lastSeenAt: new Date() },
  });

  const job = await prisma.analysisJob.create({
    data: { userId: user.id, source: SOURCE, status: 'PENDING' },
  });

  await prisma.game.createMany({ data: rows.map((r) => ({ ...r, jobId: job.id })) });

  await analytics.capture(emailHash, 'signup_completed', { source: SOURCE });
  await analytics.capture(emailHash, 'job_started', {
    jobId: job.id,
    source: SOURCE,
    games: rows.length,
  });

  return jsonOk({ jobId: job.id, userId: user.id }, 201);
}
