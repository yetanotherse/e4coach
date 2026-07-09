import { StudyStartSchema } from '@/lib/validation';
import { jsonError, jsonOk } from '@/lib/server';
import { startStudyFlow } from '@/lib/lichessOauth';

/**
 * POST /api/import/study/start — capture email + consent, begin the Lichess
 * OAuth (PKCE) flow, and return the authorize URL for the client to redirect to.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }
  const parsed = StudyStartSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Invalid input', 422);
  }
  const url = startStudyFlow(parsed.data.email);
  return jsonOk({ url });
}
