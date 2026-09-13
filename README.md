# Chess Coach (e4coach)

A personal chess coach — an AI-native coaching layer over games you already play.
It imports your recent games from **Lichess** or **Chess.com** (or a PGN upload /
Lichess study), evaluates every move with **Stockfish**, classifies your mistakes
into a weakness taxonomy, and turns the results into a grounded **weakness report**,
a **weekly training plan**, and **drills** built from your own games.

> Spec & architecture background: [`plans/chess-coach-spec.md`](plans/chess-coach-spec.md).
> Not affiliated with Lichess or Chess.com.

## What it does

1. **Sign up** with email + chess platform username (magic link or 6-digit email OTP;
   30-day sliding session). Rate-limited, DB-backed fixed windows.
2. **Import games** — Lichess public API, Chess.com public archives, PGN upload, or
   your own Lichess studies via OAuth (PKCE, `study:read`, token used once and discarded).
3. **Analyze** — a background worker evaluates every move with **Stockfish** (native,
   pooled, deterministic fixed-depth by default) and classifies mistakes into a
   weakness taxonomy: hanging pieces, missed tactics, opening inaccuracies, failed
   conversions, weak defense, endgame technique, time trouble, positional drift.
4. **Report** — an LLM (Gemini Flash or DeepSeek, behind an adapter) turns the ranked
   weakness profile into a friendly report, grounded strictly on the engine's facts
   (Zod-validated output, deterministic template fallback). Positions render on
   interactive boards: oriented to your color, played vs. better move as red/green
   arrows, step-through, deep-links to the exact move on Lichess. Optional
   **deep analysis** (deeper MultiPV pass) explains _why_ the engine's move was better.
5. **Train** — a weekly **training plan** derived from your weakness profile, with
   **drills** from your own game mistakes plus thematically matched positions from the
   **Lichess puzzle database**; a solve UI records attempts and gives grounded feedback.
6. **Stay on track** — a review page and weekly nudge emails; full funnel + retention
   instrumented in **PostHog**.

## How weaknesses are ranked

Weakness sections are ordered by **estimated rating impact**, not by raw number of issues. For
each category we sum a per-instance impact derived from centipawn loss (`estimatedRatingLoss`);
categories are then sorted by that total, with **frequency** (issue count) as a tiebreaker and
taxonomy order as the final fallback. The top 3 by this measure become the report's headline
weaknesses (`aggregateProfile` in `packages/core/src/analysis/aggregate.ts`).

This is intentional: a few game-losing blunders usually matter more than many tiny inaccuracies,
so a category with fewer but more severe mistakes can rank above one with more frequent, minor
ones. Each section still shows "We saw this N times," so the issue count is always visible even
though it is not the sort key.

Game selection is a **filter, not a per-type quota**: picking multiple time controls analyzes the
most-recent N games matching _any_ of them (sorted by date). A bullet-heavy player who selects
bullet/blitz/rapid may therefore get an all-bullet sample; the report's scope line calls this out
when the selection and the analyzed sample differ.

## Monorepo layout

```
apps/
  web/      Next.js — landing, auth (magic link + OTP), dashboard, plan, drills,
            review, report view, PGN/study import, API routes
  worker/   Node — job poller + staged pipeline (fetch → parse → evaluate →
            classify → generate → plan → notify) + nudge scanner
packages/
  core/     Domain: types, weakness taxonomy, detectors, aggregation, plan builder,
            prompts, adapter PORTS. No I/O, no vendor imports.
  adapters/ Vendor adapters (Lichess/Chess.com/Stockfish/Gemini/DeepSeek/PostHog/
            Resend/billing stub) + Mock* implementations
  db/       Prisma schema + client + migrations (Postgres/Supabase)
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

**Run with real analysis** (Lichess/Chess.com + native Stockfish + a real LLM): set in `.env`
`GAME_SOURCE=lichess` (or `chesscom`), `ENGINE_KIND=native`, `STOCKFISH_PATH=...`, plus the LLM
provider vars below. Analytics/email similarly switch to `posthog` / `resend`.

### LLM provider (Gemini or DeepSeek)

The LLM is selected by env — no code changes are needed to switch:

```bash
# Gemini (default for production)
LLM_PROVIDER="gemini"
LLM_MODEL="gemini-2.5-flash"      # gemini-2.0-flash is shut down (404s)
GEMINI_API_KEY="..."

# DeepSeek (OpenAI-compatible; significantly cheaper per token)
LLM_PROVIDER="deepseek"
LLM_MODEL="deepseek-v4-flash"
DEEPSEEK_API_KEY="sk-..."
DEEPSEEK_THINKING="false"         # V4 thinking mode — off by default (adds latency + cost)
```

Switching is just env vars: change `LLM_PROVIDER` + `LLM_MODEL` + the matching key and restart
the worker. Only the worker calls the LLM (report prose, mistake/drill explanations, plan goals);
all output is Zod-validated and grounded against engine facts with a template fallback, so a
provider failure degrades gracefully rather than failing the job.

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

## Deployment

See [DEPLOY.md](DEPLOY.md). Web → Vercel, worker → Render/Fly or any Docker host
(native Stockfish compiled in the image), Postgres → Supabase/Neon.

## Attribution

- **Stockfish** — the analysis engine ([GPL-3.0](https://github.com/official-stockfish/Stockfish));
  invoked as a separate unmodified binary via UCI, not linked into this codebase.
- **Lichess puzzle database** — source of thematic drill positions, licensed
  [CC-BY-SA 4.0](https://database.lichess.org/#puzzles). Puzzles are stored with their
  Lichess puzzle id (`Puzzle.externalId`) for provenance.
- **Lichess / Chess.com APIs** — game import uses their public APIs; please respect their
  terms and rate limits.

## License

[MIT](LICENSE) © yetanotherse
