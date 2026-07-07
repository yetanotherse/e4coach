# Deployment

Two deployables + one database (spec §5, §14.15):

| Piece | Host | Notes |
|---|---|---|
| **Web** (`apps/web`) | Vercel | Next.js 14 app: landing, auth, report, API routes |
| **Worker** (`apps/worker`) | Render / Fly.io | Always-on Node process, native Stockfish, poll loop |
| **Postgres** | Supabase (or Neon) | Prisma schema; run migrations before first deploy |

Everything is behind adapters selected by env, so flip a provider by changing one variable.

---

## 0. Provision external services

- **Supabase** project → copy the pooled `DATABASE_URL` and the direct `DIRECT_URL`.
- **Google AI Studio** → `GEMINI_API_KEY`.
- **Resend** → `RESEND_API_KEY` + verify your sending domain → set `EMAIL_FROM`.
- **PostHog** (cloud) → `POSTHOG_KEY` + `POSTHOG_HOST`.
- Pick a descriptive `LICHESS_USER_AGENT` (e.g. `ChessCoach/1.0 (you@example.com)`).
- Generate `AUTH_SECRET`: `openssl rand -base64 32`.

## 1. Database migration (once, and on schema changes)

```bash
DATABASE_URL=... DIRECT_URL=... pnpm --filter @chess-coach/db exec prisma migrate deploy
```

For the very first migration from the schema, run `prisma migrate dev --name init` locally against the dev DB to create the migration files, commit them, then `migrate deploy` in prod.

## 2. Web → Vercel

- Import the repo; set **Root Directory = `apps/web`**.
- Build command `pnpm build`, install `pnpm install` (Vercel detects pnpm workspaces).
- Env vars: `DATABASE_URL`, `DIRECT_URL`, `APP_URL` (your Vercel URL), `AUTH_SECRET`,
  `LLM_PROVIDER=mock` *(web never calls the LLM; worker does)*, `ANALYTICS_PROVIDER=posthog`,
  `POSTHOG_KEY`, `POSTHOG_HOST`, `MAILER_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM`,
  `GAME_SOURCE=lichess`.
- The web tier only enqueues jobs and reads reports — it needs DB + analytics + mailer (for
  magic links), not Stockfish or Gemini.

## 3. Worker → Render (blueprint provided)

`render.yaml` defines the worker service from `apps/worker/Dockerfile` (Debian + `stockfish`
at `/usr/games/stockfish`). Set the secret env vars in the dashboard (they're `sync:false`).

Ubuntu/Debian Stockfish install (what the Docker image does):

```bash
sudo apt-get update && sudo apt-get install -y stockfish   # → /usr/games/stockfish
```

Or Fly.io: `fly launch` with the same Dockerfile; set secrets via `fly secrets set`.

## 4. Smoke-check production

- Sign up on the landing page with a real Lichess username.
- Watch the worker logs step through `FETCHING → EVALUATING → CLASSIFYING → GENERATING → DONE`.
- Confirm the "report ready" email arrives and the report renders with real positions.
- Verify funnel events land in PostHog (`landing_view`, `signup_completed`, `job_completed`,
  `report_viewed`, `interest_clicked`).

## Local end-to-end (mocks, no external keys)

```bash
cp .env.example .env            # defaults are all `mock` except set DATABASE_URL
pnpm db:generate && pnpm --filter @chess-coach/db exec prisma migrate deploy
pnpm web:dev        # terminal 1
pnpm worker:dev     # terminal 2
```

Sign up with username `mockuser` (canned games), or `unknownuser` / `nogamesuser` to exercise
the error paths. To run the real engine locally set `ENGINE_KIND=native GAME_SOURCE=lichess`
and `STOCKFISH_PATH` (e.g. `/opt/homebrew/bin/stockfish` on macOS).

## e2e funnel test

With the stack running (mock providers) and a test Postgres:

```bash
pnpm --filter @chess-coach/e2e run install-browsers
BASE_URL=http://localhost:3000 pnpm --filter @chess-coach/e2e test
```
