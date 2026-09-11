/**
 * Middleware (plans/phase-2.md 2.0.3 + 2.0.4). Two jobs:
 * 1. Sliding session renewal — re-issue the 30-day cookie when a valid session
 *    is past half its TTL, so active users are never logged out.
 * 2. Route guarding stays decentralized: pages/routes already check sessions
 *    themselves (/analyzing/[jobId] and /report/[slug] are intentionally
 *    public — the job id / slug IS the capability during first-run flows).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, signTokenEdge, verifyTokenEdge } from './lib/tokenEdge';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // keep in sync with lib/auth.ts
const REFRESH_THRESHOLD_MS = SESSION_TTL_MS / 2; // refresh when < 15 days remain

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.next();

  const secret = process.env.AUTH_SECRET ?? 'dev-secret-change-me';
  const payload = await verifyTokenEdge(secret, token);
  if (!payload) return NextResponse.next();
  if (payload.exp - Date.now() >= REFRESH_THRESHOLD_MS) return NextResponse.next();

  const res = NextResponse.next();
  res.cookies.set(SESSION_COOKIE, await signTokenEdge(secret, payload.sub, SESSION_TTL_MS), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
}

export const config = {
  // Skip static assets and the redirect flows that manage their own cookies.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/auth/callback|api/import/study/callback|api/import/handoff|api/health).*)',
  ],
};
