# Chess Coach — MVP

A personal chess coach. Turns a user's own Lichess games into a clear, personal
**weakness report**. This is a demand-validation MVP (see `chess-coach-spec.md`).

## What it does

1. User submits their **Lichess username + email** on the landing page (and picks how
   many recent games and which time controls to analyze).
2. A background **worker** imports those games (Lichess API), evaluates every move with
   **Stockfish**, and classifies mistakes into a weakness taxonomy (hanging pieces, missed
   tactics, opening inaccuracies, failed conversions, weak defense, endgame technique, time
   trouble, positional drift).
3. It aggregates a ranked **weakness profile**, and **Gemini** turns it into a friendly report
   — grounded strictly on the engine's facts (with a deterministic template fallback).
4. The user gets an emailed link to a **persistent, shareable report**: top weaknesses in plain
   language, with real positions from their own games rendered on interactive boards (oriented
   to their color, played vs. better move as red/green arrows, step-through, deep-links to the
   exact move on Lichess).
5. Full funnel + retention is instrumented in **PostHog**; a fake-door measures willingness-to-pay.

## Monorepo layout

```
apps/
  web/      Next.js — landing, magic-link auth, dashboard, report view, API routes
  worker/   Node — job poller + staged analysis pipeline (native Stockfish)
packages/
  core/     Domain: types, weakness taxonomy, detectors, aggregation, prompts, adapter PORTS
  adapters/ Vendor adapters (Lichess/Stockfish/Gemini/PostHog/Resend) + Mock*
  db/       Prisma schema + client (Postgres/Supabase)
  config/   Zod-validated typed env + provider selection
e2e/        Playwright funnel test
```

Architecture is **ports & adapters**: domain code depends only on interfaces in
`packages/core`; vendors are wired at the edges and selected by env. Nothing in the domain
imports a vendor SDK directly, so any provider is swappable via one env var.

## Getting started (local)

Both apps read a single **repo-root `.env`** (the worker loads it explicitly; Next loads it via
`next.config`). A Postgres connection is required even in mock mode (Prisma). Everything else
defaults to `mock`, so no external API keys are needed to click through the funnel.

```bash
corepack enable && corepack prepare pnpm@9.15.0 --activate
pnpm install
cp .env.example .env          # set DATABASE_URL (+ DIRECT_URL); other providers stay mock
pnpm db:generate              # generate Prisma client
pnpm --filter @chess-coach/db run migrate   # create tables (loads root .env via dotenv-cli)

# two terminals:
pnpm web:dev                  # http://localhost:3000
pnpm worker:dev               # job poll loop
```

Sign up with username `mockuser` (canned games), or `unknownuser` / `nogamesuser` to exercise
the error paths.

**Run with real analysis** (Lichess + native Stockfish + Gemini): set in `.env`
`GAME_SOURCE=lichess`, `ENGINE_KIND=native`, `STOCKFISH_PATH=...`, `LLM_PROVIDER=gemini`,
`LLM_MODEL=gemini-2.5-flash` (note: `gemini-2.0-flash` is **shut down** and 404s), plus
`GEMINI_API_KEY`. Analytics/email similarly switch to `posthog` / `resend`.

> **Supabase note:** the direct `db.<ref>.supabase.co` host is IPv6-only. Use the **pooler**
> for both URLs — transaction pooler (`:6543`, `pgbouncer=true`) for `DATABASE_URL`, session
> pooler (`:5432`) for `DIRECT_URL` — and use an alphanumeric DB password (special chars break
> the connection string).

## Checks

```bash
pnpm typecheck && pnpm lint
STOCKFISH_PATH=/path/to/stockfish pnpm test   # native-engine tests skip if no binary
```

## Real end-to-end check (live Lichess + Stockfish, no DB, no LLM)

```bash
STOCKFISH_PATH=/path/to/stockfish \
  pnpm --filter @chess-coach/worker exec tsx src/smoke.ts <lichessUsername> 6
```

Prints the ranked weakness profile and example moves (with assessments and better moves in SAN)
for a real account — the fastest way to sanity-check the analysis engine end to end.

## Build phases

- **A — Foundation** ✅ monorepo, config, db schema, adapter ports + mocks
- **B — Vertical slice on mocks** ✅ core weakness engine → worker pipeline → web funnel
- **C — Real adapters** ✅ Lichess, native Stockfish, Gemini Flash
- **D — Auth/email/analytics/deploy** ✅ magic-link, Resend, PostHog, Playwright e2e, Docker/Render
- **E — Analysis quality** ✅ detector exclusivity + decided-position guards, played-best-move
  false-positive fix, instructive example selection (configurable count), user-facing game-scope
  controls + transparency, oriented boards with arrows/step-through, elaborated grounded notes

## Deployment

See [DEPLOY.md](DEPLOY.md). Web → Vercel, worker → Render/Fly (Docker + native Stockfish),
Postgres → Supabase. Ubuntu Stockfish: `sudo apt-get install -y stockfish` (`/usr/games/stockfish`).
