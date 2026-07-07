# Chess Coach — MVP

A personal chess coach. Turns a user's own Lichess games into a clear, personal
**weakness report**. This is a demand-validation MVP (see `chess-coach-spec.md`).

## Monorepo layout

```
apps/
  web/      Next.js — landing, auth, report view, API routes (Phase B)
  worker/   Node — job poller + analysis pipeline
packages/
  core/     Domain: types, weakness taxonomy, detectors, aggregation, adapter PORTS
  adapters/ Vendor adapters (Lichess/Stockfish/Gemini/PostHog/Resend) + Mock*
  db/       Prisma schema + client (Postgres/Supabase)
  config/   Zod-validated typed env + provider selection
e2e/        Playwright funnel test (Phase D)
```

Architecture is **ports & adapters**: domain code depends only on interfaces in
`packages/core`; vendors are wired at the edges and selected by env. Nothing in
the domain imports a vendor SDK directly.

## Getting started

```bash
corepack enable && corepack prepare pnpm@9.15.0 --activate
pnpm install
pnpm db:generate            # generate Prisma client
cp .env.example .env        # defaults select mock providers — no keys needed
pnpm typecheck && pnpm lint && pnpm test
pnpm worker:dev             # boots the worker on mock providers
```

All providers default to `mock`, so the full pipeline runs offline with no API
keys. Real adapters (Lichess/Stockfish/Gemini) are swapped in via env in Phase C.

## Build phases

- **A — Foundation** ✅ monorepo, config, db schema, adapter ports + mocks
- **B — Vertical slice on mocks** ✅ core weakness engine → worker pipeline → web funnel
- **C — Real adapters** ✅ Lichess, native Stockfish, Gemini Flash
- **D — Auth/email/analytics/deploy** ✅ magic-link, Resend, PostHog, Playwright e2e, Docker/Render

## Deployment

See [DEPLOY.md](DEPLOY.md). Web → Vercel, worker → Render/Fly (Docker + native Stockfish),
Postgres → Supabase. Ubuntu Stockfish: `sudo apt-get install -y stockfish` (`/usr/games/stockfish`).

## Real end-to-end check (live Lichess + Stockfish, no DB)

```bash
STOCKFISH_PATH=/path/to/stockfish \
  pnpm --filter @chess-coach/worker exec tsx src/smoke.ts <lichessUsername> 3
```
