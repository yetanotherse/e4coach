import { parseLichessStudies } from '@chess-coach/core';
import { analytics, env, prisma } from '@/lib/server';
import { hashEmail } from '@/lib/hash';
import {
  consumeStudyFlow,
  exchangeCode,
  fetchAccountUsername,
  fetchStudiesPgn,
} from '@/lib/lichessOauth';

const IMPORT_CEILING = 1000; // parse ceiling; worker analyzes up to MAX_ANALYZED_GAMES

function redirect(path: string): Response {
  return Response.redirect(`${env.APP_URL}${path}`, 303);
}

/**
 * GET /api/import/study/callback — verify state, exchange the code, fetch the
 * user's studies, keep only attributable standard games, create the job + Game
 * rows, and hand off to the progress screen. The OAuth token is used here and
 * discarded (never persisted).
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const flow = consumeStudyFlow();

  if (url.searchParams.get('error')) return redirect('/?studyError=denied');
  if (!code || !state || !flow || state !== flow.state) {
    return redirect('/?studyError=invalid');
  }

  let games;
  let username: string;
  try {
    const token = await exchangeCode(code, flow.verifier);
    username = await fetchAccountUsername(token);
    const pgn = await fetchStudiesPgn(token, username);
    ({ games } = parseLichessStudies(pgn, { username, max: IMPORT_CEILING }));
  } catch (err) {
    console.error('[study callback]', err instanceof Error ? err.message : err);
    return redirect('/?studyError=fetch');
  }

  if (games.length === 0) return redirect('/?studyError=none');

  const emailHash = hashEmail(flow.email);
  const user = await prisma.user.upsert({
    where: { email: flow.email },
    create: { email: flow.email, emailHash, lichessUser: username, consentAt: new Date() },
    update: { lichessUser: username, emailHash, consentAt: new Date(), lastSeenAt: new Date() },
  });

  const job = await prisma.analysisJob.create({
    data: { userId: user.id, source: 'lichess-study', status: 'PENDING' },
  });

  await prisma.game.createMany({
    data: games.map((g) => ({
      jobId: job.id,
      externalId: g.id,
      pgn: g.pgn,
      white: g.white,
      black: g.black,
      userColor: g.userColor,
      result: g.result,
      timeControl: g.timeControl,
      speed: g.speed ?? null,
      playedAt: new Date(g.playedAt),
    })),
  });

  await analytics.capture(emailHash, 'signup_completed', { source: 'lichess-study' });
  await analytics.capture(emailHash, 'job_started', { jobId: job.id, source: 'lichess-study' });

  return redirect(`/analyzing/${job.id}`);
}
