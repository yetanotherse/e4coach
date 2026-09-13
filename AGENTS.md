# AGENTS.md

Instructions for AI coding agents working in this repo.

## Project

**Chess Coach** — an AI-native coaching layer over games users already play (Lichess/Chess.com). It imports a user's recent games, evaluates them with Stockfish, classifies mistakes into a weakness taxonomy, and generates grounded weakness reports, training plans, and drills.

The MVP shipped (spec phases A–E complete). The project is now in **Phase 2** (coaching product: auth hardening, Chess.com source, plans/drills, SRS).

## Source-of-truth documents (read when scope/architecture matters)

- `plans/chess-coach-spec.md` — product & engineering spec; MVP scope, architecture principles (§5.2, §8), non-functional requirements (§11). MVP build (§14) is **complete**; do not treat §14 as pending work.
- `plans/phase-2.md` — Phase 2 plan with locked decisions (D-P2-#). Active phases get their own file in `plans/`.
- `README.md` — setup, env vars, deployment notes.
- `DEPLOY.md` — deployment (Vercel web, Render/Fly worker, Supabase Postgres).

## Commands

```bash
pnpm install                 # postinstall generates the Prisma client
pnpm typecheck               # typecheck all packages
pnpm lint                    # eslint, zero warnings allowed
pnpm format:check            # prettier check (pnpm format to fix)
pnpm test                    # vitest (all unit tests)
STOCKFISH_PATH=/path/to/stockfish pnpm test   # native-engine tests skip without the binary

pnpm db:generate             # prisma generate
pnpm db:migrate              # prisma migrate dev (loads root .env via dotenv-cli)
pnpm web:dev                 # Next.js dev server → http://localhost:3000
pnpm worker:dev              # worker poll loop

# live end-to-end sanity check of the analysis engine (no DB/LLM needed):
STOCKFISH_PATH=/path/to/stockfish pnpm --filter @chess-coach/worker exec tsx src/smoke.ts <username> 6
```

Before finishing any task run: `pnpm typecheck && pnpm lint && pnpm test` (with `STOCKFISH_PATH` set if engine code changed).

## Repository layout (pnpm monorepo, Node ≥ 22, pnpm 9.15)

```
apps/
  web/      Next.js (App Router) — landing, auth, dashboard, plan, report view, API routes
  worker/   Node worker — job poller + staged pipeline (fetch → parse → evaluate → classify → generate → plan)
packages/
  core/     DOMAIN: types, weakness taxonomy, detectors, aggregation, plan builder, prompts, adapter PORTS. No I/O, no vendor imports.
  adapters/ Vendor adapters: lichess, chesscom, stockfish, llm (gemini/deepseek + mock), analytics (posthog), email (resend), billing, rating + Mock* implementations
  db/       Prisma schema + client + migrations (Supabase Postgres)
  config/   Zod-validated typed env + provider selection
e2e/        Playwright funnel test
```

## Architecture rules (hard requirements)

- **Ports & adapters (hexagonal).** Domain code depends only on interfaces in `packages/core/src/ports`; vendor SDKs are imported only in `packages/adapters`. Never import a vendor SDK from `core`. New providers = new adapter + env switch, no domain changes.
- **All external shapes are Zod-validated** at boundaries (API input, external API responses, LLM output, env in `packages/config`). No `any` at module boundaries.
- **Pure domain logic in `core`** (no I/O); adapters do I/O. Detectors and aggregation are pure functions tested against PGN fixtures.
- **LLM grounding contract:** the LLM only phrases facts already computed by the engine/classifier. It must never invent evaluations, moves, or themes. LLM output is Zod-validated against a fixed schema; any failure falls back to a deterministic template. Never fail a job because the LLM failed.
- **Pipeline stages are idempotent and resumable** with per-stage status; per-game failures are isolated (skip + record, don't fail the job).
- Only the worker calls the LLM/engine. Secrets never reach the browser.

## Conventions

- TypeScript strict everywhere; ESLint + Prettier enforced (`pnpm lint` must pass with `--max-warnings 0`).
- **Conventional commits** (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `style:`, `docs:`) — see `git log` for examples.
- Tests live next to the code (`*.test.ts`) using vitest. Write tests alongside code, not after. Detector changes need curated PGN fixtures with known outcomes.
- Keep PRs small and reviewable. Do not commit secrets; all config comes from env (see `.env.example`).

## Environment / gotchas

- Both apps read the single repo-root `.env`. Everything defaults to `mock` providers — the full funnel works with only `DATABASE_URL` set (mock username: `mockuser`; `unknownuser` / `nogamesuser` exercise error paths).
- **Supabase:** use the **pooler** hosts for both `DATABASE_URL` (transaction pooler `:6543`, `pgbouncer=true`) and `DIRECT_URL` (session pooler `:5432`); the direct `db.<ref>.supabase.co` host is IPv6-only. Use an alphanumeric DB password.
- `gemini-2.0-flash` is shut down (404s) — use `gemini-2.5-flash` or `deepseek-v4-flash`.
- Native-Stockfish tests skip when `STOCKFISH_PATH` is unset; set it locally to run the full suite.
- Provider switching (LLM/game source/engine/analytics/email) is env-only via `packages/config` — never hardcode a provider in domain or app code.
