/**
 * Lichess OAuth2 PKCE (public client, no secret) for importing a user's studies
 * with the `study:read` scope. We use the token inside the callback to fetch the
 * account + studies, then discard it — never persisted.
 */
import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from './server';
import { signToken, verifyToken } from './token';

const AUTHORIZE_URL = 'https://lichess.org/oauth';
const TOKEN_URL = 'https://lichess.org/api/token';
const ACCOUNT_URL = 'https://lichess.org/api/account';
const STUDY_COOKIE = 'cc_study_oauth';
const SCOPE = 'study:read';
const FLOW_TTL_MS = 15 * 60 * 1000;

/** client_id is just a stable public identifier for a PKCE app. */
function clientId(): string {
  return `${env.APP_URL}/`;
}
function redirectUri(): string {
  return `${env.APP_URL}/api/import/study/callback`;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64url');
}

export interface StudyFlowState {
  email: string;
  perfTypes?: string[];
  verifier: string;
  state: string;
}

/**
 * Begin the flow: create PKCE verifier + state, stash them (plus the email) in a
 * short-lived signed cookie, and return the Lichess authorize URL.
 */
export function startStudyFlow(email: string, perfTypes?: string[]): string {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(16));

  const payload: StudyFlowState = { email, verifier, state, ...(perfTypes ? { perfTypes } : {}) };
  cookies().set(STUDY_COOKIE, signToken(env.AUTH_SECRET, JSON.stringify(payload), FLOW_TTL_MS), {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: FLOW_TTL_MS / 1000,
  });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId(),
    redirect_uri: redirectUri(),
    scope: SCOPE,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

/** Read + clear the flow cookie; returns the parsed state or null if invalid. */
export function consumeStudyFlow(): StudyFlowState | null {
  const jar = cookies();
  const raw = jar.get(STUDY_COOKIE)?.value;
  jar.delete(STUDY_COOKIE);
  if (!raw) return null;
  const json = verifyToken(env.AUTH_SECRET, raw); // returns the signed subject string
  if (!json) return null;
  try {
    return JSON.parse(json) as StudyFlowState;
  } catch {
    return null;
  }
}

/** Exchange the authorization code for an access token (PKCE). */
export async function exchangeCode(code: string, verifier: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri(),
      client_id: clientId(),
    }),
  });
  if (!res.ok) throw new Error(`Lichess token exchange failed: ${res.status}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('No access_token in Lichess response');
  return json.access_token;
}

/** Fetch the authenticated account's username. */
export async function fetchAccountUsername(token: string): Promise<string> {
  const res = await fetch(ACCOUNT_URL, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Lichess account fetch failed: ${res.status}`);
  const json = (await res.json()) as { username?: string; id?: string };
  const name = json.username ?? json.id;
  if (!name) throw new Error('No username in Lichess account');
  return name;
}

/** Fetch a user's studies as one multi-game PGN. */
export async function fetchStudiesPgn(token: string, username: string): Promise<string> {
  const res = await fetch(
    `https://lichess.org/api/study/by/${encodeURIComponent(username)}/export.pgn`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/x-ndjson' } },
  );
  if (!res.ok) throw new Error(`Lichess studies export failed: ${res.status}`);
  return res.text();
}
