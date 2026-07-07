import { jsonOk } from '@/lib/server';
import { clearSession } from '@/lib/auth';

/** POST /api/auth/logout — clear the session cookie. */
export async function POST(): Promise<Response> {
  clearSession();
  return jsonOk({ ok: true });
}
