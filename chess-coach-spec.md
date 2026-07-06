# Chess Coach — Product & Engineering Specification

*Version 1.0 · July 2026 · Owner: Shishir · Audience: Claude Code (implementation agent) + engineers*

> This is the single source of truth. It covers the **MVP** in build-ready detail and lists **all future phases** so the whole roadmap lives in one place. Build strictly in the order given in §14. Anything marked **[MVP]** is in scope now; **[P2]/[P3]/[P4]** are future.

---

## 0. How to use this document (for the implementation agent)

- Build **only the MVP (§3–§13)** first. Do not implement future-phase features; only leave clean extension points where noted.
- Treat every **Decision (D#)** as fixed unless a Decision explicitly says "revisit."
- Every external boundary (LLM, engine, game-source, analytics) must sit behind an **interface/adapter** so it is swappable. This is a hard requirement, not a nicety.
- Follow the **repo layout (§12)**, **coding standards (§11.6)**, and **build order (§14)**. Write tests alongside code (§10), not after.
- When a requirement is ambiguous, prefer the simplest thing that satisfies the **validation goal (§2)**. The MVP exists to measure demand, not to be feature-complete.

---

## 1. Product vision & the one-line thesis

**Vision:** *A personal chess coach — a structured school, not a toolbox.* An AI-native coaching layer that works on top of the games users already play (Lichess/Chess.com), diagnoses their specific weaknesses, and turns them into a guided improvement path.

**MVP thesis to validate:** *Adult improvers (≈800–1600) will give us their email and come back, if we turn their own games into a clear, personal weakness report for free.* If they do, the wedge is real and we build the full coaching product. If they don't, we stop before heavy investment.

---

## 2. MVP goal & success criteria (this is the whole point)

The MVP is a **demand-validation instrument**, not a coaching product. It must cheaply answer: *do people want this, and do they come back?*

**Primary validation metrics (instrument from day one):**

| Metric | Definition | Rough "green light" signal |
|---|---|---|
| **Sign-up conversion** | % of landing visitors who submit email + username | ≥ 15–25% of engaged visitors |
| **Report completion** | % of sign-ups who receive & view a full report | ≥ 80% |
| **Return rate (the key one)** | % of users who come back ≥ 1 time within 7 days without a nudge | ≥ 25–30% |
| **Re-analysis rate** | % who import/analyze a second batch of games | ≥ 20% |
| **Willingness-to-pay signal** | clicks on a "Get my weekly training plan — notify me / $X" fake-door | ≥ 15% of report viewers |
| **Qualitative** | ≥ 15 user interviews / feedback submissions | n/a |

**Explicit non-goals for MVP:** no live play, no full curriculum, no accountability engine, no payments, no mobile-native app, no social features, no Maia. Those are future phases and must not be built now.

**Time budget:** ~2–3 weeks of build. Bias every decision toward speed and low fixed cost.

---

## 3. MVP scope

### 3.1 In scope

1. **Marketing landing page** — clear value prop, single primary CTA ("Get my free weakness report"), fake-door WTP CTA, privacy note, minimal analytics-friendly design.
2. **Sign-up / lead capture** — email + chess platform username (Lichess for MVP; Chess.com optional stretch). Magic-link auth (passwordless) so users can return to a persistent report.
3. **Game import** — fetch the user's recent games from the **Lichess public API** (no OAuth needed for public games).
4. **Weakness analysis engine** — evaluate imported games with **Stockfish**, compute per-move centipawn loss, classify error patterns via heuristics, aggregate into a weakness profile.
5. **AI report generation** — an **LLM (Gemini Flash default, behind an adapter)** turns the structured weakness profile into a friendly, plain-language report: top 3 weaknesses, why they cost rating, one concrete recommendation each, 2–3 illustrative positions from the user's own games.
6. **Report view** — persistent, shareable (private link) web page rendering the report with interactive board snippets (Chessground).
7. **Analytics & event instrumentation** — full funnel + retention tracking.
8. **Fake-door for the paid product** — measures WTP without building it.
9. **Transactional email** — magic link + "your report is ready."

### 3.2 Out of scope (do not build)

Live/multiplayer play, curriculum/lessons, spaced-repetition trainer, payments/billing, Chess.com OAuth, Maia/human-like models, native mobile, teams/social, i18n. All are future phases (§13).

### 3.3 MVP user stories

- *As a visitor*, I understand in 10 seconds what I get and give my email + Lichess username.
- *As a new user*, my recent games are imported and analyzed within a few minutes; I'm emailed when ready (and shown live progress if I wait).
- *As a user*, I see a clear report: my top weaknesses, plain-language explanations, and my own game positions illustrating each.
- *As a returning user*, I can re-open my report via a link and analyze a fresh batch of games.
- *As the founder*, I can see the funnel and retention in an analytics dashboard.

---

## 4. Core user flows

**Flow A — First visit → report**
`Landing → CTA → enter email + Lichess username → (magic link OR immediate provisional session) → "Analyzing your games…" progress screen → Report ready (email + on-screen) → Report view → fake-door WTP CTA`

**Flow B — Return**
`Magic link / saved link → Dashboard (past report(s)) → "Analyze new games" → new Report`

**Flow C — Analysis pipeline (backend, async)**
`Create AnalysisJob → fetch games (Lichess API) → parse PGN (chess.js) → engine eval per move (Stockfish worker) → classify errors (heuristics) → aggregate weakness profile → LLM report generation (adapter) → persist Report → notify user`

Design the pipeline as **idempotent, resumable stages** with per-stage status so a failure in one game or one stage doesn't kill the job.

---

## 5. System architecture

### 5.1 High-level

```
┌──────────────┐      ┌─────────────────────────────┐
│   Browser    │  →   │  Next.js app (Vercel)        │
│ Landing +    │  ←   │  - marketing pages           │
│ Report view  │      │  - auth (magic link)         │
│ (Chessground)│      │  - REST/RPC API routes       │
└──────────────┘      │  - enqueues AnalysisJob      │
                      └───────────────┬─────────────┘
                                      │ job (DB queue / Inngest)
                                      ▼
                      ┌─────────────────────────────┐
                      │  Worker service (Render/Fly) │
                      │  - Lichess fetch adapter     │
                      │  - Stockfish engine pool     │
                      │  - error classifier          │
                      │  - LLM adapter (Gemini Flash)│
                      └───────────────┬─────────────┘
                                      ▼
        ┌───────────────┐   ┌──────────────┐   ┌───────────────┐
        │ Postgres (Neon│   │ PostHog       │   │ Email (Resend)│
        │ /Supabase)    │   │ analytics     │   │               │
        └───────────────┘   └──────────────┘   └───────────────┘
```

**Why a separate worker (D1):** Stockfish evaluation of dozens of games is CPU-bound and long-running — unsuitable for Vercel serverless time limits. A small always-on/queue-driven worker (Node) owns the heavy pipeline. The Next.js app stays thin: UI, auth, API, enqueue. **Revisit** only if you decide to cap analysis small enough to run in serverless.

### 5.2 Key architectural principles

- **Ports & adapters (hexagonal).** Domain logic (weakness analysis, report assembly) depends on **interfaces**, never on concrete vendors. Vendors (Gemini, Stockfish, Lichess, PostHog, Resend) are adapters wired at the edges. This is what makes the stack "plug-and-play."
- **Async, staged, idempotent pipeline.** Each stage persists its output; jobs are resumable and observable.
- **Stateless app tier**; all state in Postgres. Horizontal-scale friendly later.
- **Thin vertical slice first.** Ship import→report end-to-end for one source (Lichess) before breadth.

---

## 6. Technology stack (decisions + rationale)

| Concern | Choice | Rationale / notes |
|---|---|---|
| Language | **TypeScript** (strict) everywhere | One language across app + worker; strong typing for chess domain. |
| App framework | **Next.js 14+ (App Router), React 18** | Single codebase for marketing site + app + API routes; great SEO for landing; fast to ship. |
| Styling / UI | **Tailwind CSS + shadcn/ui** | Fast, consistent, accessible primitives. |
| Chess board UI | **Chessground** + **chess.js** | Chessground for rendering positions in the report; chess.js for PGN parsing/legality. |
| Chess engine | **Stockfish** (native binary in worker; **stockfish.js/WASM** fallback) | Server-side native = far faster batch eval than WASM. WASM kept as an adapter option. |
| LLM | **Gemini Flash** (default) **behind `LlmProvider` interface** | Cheap, fast, adequate for report prose. Swappable (see §8). |
| DB | **Postgres** via **Neon** or **Supabase** | Relational fits users/jobs/games/reports; serverless-friendly. |
| ORM | **Prisma** | Type-safe schema + migrations. |
| Auth | **Magic link (passwordless)** via Auth.js *or* Supabase Auth | Lowest friction; email is the asset we're capturing; enables return-visit tracking. |
| Background jobs | **DB-backed queue** for MVP (or **Inngest**) | Keep infra minimal. A `jobs` table + worker poll loop is enough at MVP volume. Inngest if you want retries/observability out of the box. |
| Worker hosting | **Render** or **Fly.io** (always-on small instance) | Needs a persistent process + native Stockfish binary. |
| App hosting | **Vercel** | First-class Next.js. |
| Analytics | **PostHog** (cloud) | Funnels, retention cohorts, session replay, feature flags, fake-door tracking — exactly the MVP's job. |
| Email | **Resend** (or Postmark) | Simple transactional email + React email templates. |
| Error monitoring | **Sentry** | App + worker. |
| Validation | **Zod** | Runtime validation at all boundaries (API input, external API responses, env). |
| Testing | **Vitest** (unit), **Playwright** (e2e) | Fast unit runner; e2e for the critical funnel. |
| Lint/format | **ESLint + Prettier**, **TypeScript strict** | Enforced in CI. |
| Package mgr / mono | **pnpm workspaces** (monorepo: `app`, `worker`, shared `core`) | Share domain + types between app and worker. |

**D2 — Monorepo with a shared `core` package.** The domain (types, weakness taxonomy, analysis logic, adapters interfaces) lives in `packages/core`, imported by both `apps/web` and `apps/worker`. Prevents drift and duplicated chess logic.

---

## 7. External integrations

### 7.1 Lichess API [MVP]

- Public games export: `GET https://lichess.org/api/games/user/{username}` (NDJSON/PGN stream), with params for `max`, `rated`, `perfType`, `clocks=true`, `evals=true`, `opening=true`.
- **Use Lichess's own `evals` when present** to reduce Stockfish load; only engine-evaluate positions lacking an eval.
- No OAuth needed for public game export. Respect rate limits (see §11.4); set a descriptive `User-Agent`; back off on 429.
- Adapter interface `GameSource` (see §8) so Chess.com and PGN upload plug in later.
- Handle: unknown username, private/zero games, streams that time out, non-standard variants (filter to standard chess for MVP).

### 7.2 Chess.com API [P2, stub only]
Public API (`api.chess.com/pub/player/{u}/games/...`) is monthly-archive based. Define the adapter interface now; implement later.

### 7.3 Gemini (LLM) [MVP] — see §8.

### 7.4 PostHog, Resend, Sentry [MVP] — standard SDK integration behind thin wrappers.

---

## 8. Pluggable adapter interfaces (hard requirement)

All four must be interfaces in `packages/core`, with concrete adapters selected by env/config. **No domain code imports a vendor SDK directly.**

### 8.1 `LlmProvider` (Gemini Flash default)

```ts
export interface LlmMessage { role: 'system' | 'user' | 'assistant'; content: string; }

export interface LlmGenerateOptions {
  model?: string;            // provider-specific id; default from config
  temperature?: number;      // default 0.4
  maxOutputTokens?: number;
  responseFormat?: 'text' | 'json';
  jsonSchema?: object;       // when responseFormat === 'json'
  timeoutMs?: number;
  metadata?: Record<string, string>; // for tracing/cost attribution
}

export interface LlmResult {
  text: string;
  parsed?: unknown;          // when json
  usage?: { inputTokens: number; outputTokens: number };
  model: string;
  provider: string;
}

export interface LlmProvider {
  readonly name: string;
  generate(messages: LlmMessage[], opts?: LlmGenerateOptions): Promise<LlmResult>;
}
```

- Provide `GeminiFlashProvider` (default) and a `MockLlmProvider` (deterministic, for tests/offline).
- Config: `LLM_PROVIDER=gemini|mock`, `LLM_MODEL=gemini-2.x-flash`, plus a **retry/backoff + timeout wrapper** and **cost logging** (tokens → PostHog/DB) shared across providers.
- **Grounding rule:** the LLM must only *explain and phrase* facts already computed by the engine/classifier. It must never invent evaluations, moves, or tactics. Pass it a structured, pre-computed weakness profile and require it to write prose around those facts. Prefer `responseFormat: 'json'` with a fixed schema, then render deterministically.

### 8.2 `ChessEngine`

```ts
export interface EngineEval { cp?: number; mate?: number; bestMove: string; pv: string[]; depth: number; }
export interface ChessEngine {
  evaluate(fen: string, opts: { depth?: number; movetimeMs?: number }): Promise<EngineEval>;
  dispose(): Promise<void>;
}
```
- `StockfishNativeEngine` (UCI over child process, pooled) default in worker; `StockfishWasmEngine` fallback.

### 8.3 `GameSource`

```ts
export interface ImportedGame { id: string; pgn: string; white: string; black: string;
  userColor: 'white' | 'black'; result: string; timeControl: string; eco?: string;
  clocks?: number[]; evals?: EngineEval[]; playedAt: string; }
export interface GameSource {
  readonly name: string;
  fetchRecentGames(username: string, opts: { max: number; rated?: boolean; perfTypes?: string[] }): Promise<ImportedGame[]>;
}
```
- `LichessGameSource` [MVP]; `ChessComGameSource` [P2]; `PgnUploadSource` [P2].

### 8.4 `Analytics` and `Mailer`
Thin interfaces over PostHog and Resend so they're testable and swappable.

---

## 9. Weakness analysis engine (the core IP)

This is the part that must be genuinely good; everything else is scaffolding.

### 9.1 Pipeline stages (per AnalysisJob)

1. **Fetch** — `GameSource.fetchRecentGames` (default `max = 20–40` most recent rated standard games).
2. **Parse** — chess.js: reconstruct positions (FEN per ply), extract moves, clocks, ECO/opening.
3. **Evaluate** — for each position (the mover = our user), get eval before and after the played move. Use provided `evals` when available; else `ChessEngine.evaluate` at a **budgeted depth/movetime** (e.g., depth 12–16 or ~100–200ms/move — tune for cost/latency). Skip trivial/forced positions to save compute.
4. **Score moves** — compute **centipawn loss (CPL)** per user move = eval(best) − eval(played), clamped; flag **inaccuracy / mistake / blunder** by thresholds (align with Lichess conventions, e.g. ~50/100/300 cp, capped by win-probability delta for robustness).
5. **Classify errors into a weakness taxonomy** (heuristics over engine + board features):
   - *Hanging pieces / blunders of material* (undefended piece captured next move).
   - *Missed tactics* (a large swing where a forcing tactic existed — detect via best-move being a capture/check/fork motif and big CPL).
   - *Opening problems* (early large CPL / deviation from known theory within first ~10 moves; use ECO/opening name).
   - *Converting winning positions* (had eval ≥ +2.0, result not a win → conversion failure).
   - *Defending / resourcefulness* (eval ≤ −2.0 then further collapse vs. holding).
   - *Endgame technique* (errors when ≤ ~7 pieces).
   - *Time management* (large CPL correlated with low remaining clock, from `clocks`).
6. **Aggregate → WeaknessProfile** — per category: frequency, estimated rating-points lost (heuristic from CPL), trend, and up to 3 representative example positions (FEN + game link + the better move).
7. **Rank** — top 3 weaknesses by estimated impact.
8. **Report generation** — feed the structured profile to `LlmProvider` (JSON-schema output) → human-readable report; render deterministically with Chessground boards.

### 9.2 Error taxonomy (enumerate in `core`)
`HANGING_PIECE`, `MISSED_TACTIC`, `OPENING_INACCURACY`, `FAILED_CONVERSION`, `WEAK_DEFENSE`, `ENDGAME_TECHNIQUE`, `TIME_TROUBLE`, `POSITIONAL_DRIFT`. Each has: id, display name, plain-language description template, and a detector function `(context) => ErrorInstance | null`.

### 9.3 Quality & correctness guardrails
- Deterministic given same games + engine settings (fix engine version/depth; record them on the job for reproducibility).
- Unit-test each detector against curated PGN fixtures with known errors (§10).
- The report must cite **real positions from the user's games** (FEN + move number + link). No fabricated examples.
- Keep a "confidence" note when sample size is small (< ~10 games).

### 9.4 Cost & latency budget
- Target: analyze ~20 games in a few minutes for well under ~$0.05 LLM cost/report (one or two Gemini Flash calls). Cache engine evals. Reuse Lichess-provided evals. Log per-job compute + token cost to detect blowups early.

---

## 10. Data model (Prisma schema, MVP)

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  lichessUser   String?
  chessComUser  String?
  createdAt     DateTime @default(now())
  lastSeenAt    DateTime @default(now())
  analysisJobs  AnalysisJob[]
  reports       Report[]
}

model AnalysisJob {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  source      String   // 'lichess' | 'chesscom'
  status      JobStatus @default(PENDING) // PENDING|FETCHING|EVALUATING|CLASSIFYING|GENERATING|DONE|FAILED
  stage       String?  // fine-grained progress for UI
  gameCount   Int      @default(0)
  engineMeta  Json?    // { version, depth/movetime }
  error       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  report      Report?
}

model Report {
  id          String   @id @default(cuid())
  userId      String
  jobId       String   @unique
  user        User     @relation(fields: [userId], references: [id])
  publicSlug  String   @unique          // private-but-shareable link
  profile     Json     // structured WeaknessProfile (source of truth)
  content     Json     // rendered report sections (LLM prose + example refs)
  createdAt   DateTime @default(now())
  viewCount   Int      @default(0)
}

enum JobStatus { PENDING FETCHING EVALUATING CLASSIFYING GENERATING DONE FAILED }
```

- Store raw imported PGNs transiently (or in a `Game` table if you want re-analysis without re-fetch — optional for MVP).
- `publicSlug` is a long random token (unguessable) → shareable without auth, per §11.2.

---

## 11. Non-functional requirements

### 11.1 Performance
- Landing page: static/SSG, LCP < 2s.
- Report ready target: p50 < 3 min, p95 < 8 min for 20 games. Show live progress (`AnalysisJob.stage`).
- Engine pool sized to worker CPU; bound concurrent jobs.

### 11.2 Security
- Zod-validate all inputs and all external API responses.
- Secrets only in env (never client); never expose LLM/engine keys to the browser.
- Report links use unguessable slugs; no PII in the slug. Rate-limit report creation per email/IP.
- Standard headers (CSP, HSTS), CSRF protection on mutations, output-encode user-supplied usernames.
- Dependency scanning in CI (e.g., `pnpm audit`).

### 11.3 Privacy & compliance
- Collect the minimum: email + public chess username. Public-facing **privacy policy** + **consent checkbox** at sign-up.
- Clear "delete my data" path (delete User + cascade). GDPR-minded even if not strictly required.
- Only import **public** games; state this explicitly to the user.
- Don't send game PGNs to the LLM beyond what's needed; send the structured profile + minimal position context.

### 11.4 Reliability & rate limiting
- Respect Lichess rate limits; exponential backoff on 429; descriptive `User-Agent`.
- Pipeline stages idempotent + resumable; per-game failures isolated (skip + record, don't fail the whole job).
- Retries with backoff on LLM/engine transient errors; hard timeouts everywhere.
- Circuit-break the LLM: if it fails, still deliver a **template-only report** from the structured profile (graceful degradation).

### 11.5 Observability
- Structured logs (job id, stage, timings). Sentry for exceptions. Per-job metrics: games, eval count, engine time, tokens, $ cost. PostHog for product funnel.

### 11.6 Coding standards
- TypeScript strict; no `any` at module boundaries. Zod schemas are the source of truth for external shapes.
- Pure domain logic in `core` (no I/O); adapters do I/O. Small, tested functions for each detector.
- Conventional commits; PRs small and reviewable. ESLint/Prettier enforced in CI.

---

## 12. Repository layout (pnpm monorepo)

```
chess-coach/
├─ apps/
│  ├─ web/                     # Next.js: landing, auth, report view, API routes, enqueue
│  │  ├─ app/                  # App Router (marketing + /report/[slug] + /dashboard)
│  │  ├─ components/           # UI incl. Chessground wrapper
│  │  └─ lib/                  # client helpers, analytics wrapper
│  └─ worker/                  # Node worker: job poller + pipeline
│     └─ src/pipeline/         # fetch → parse → evaluate → classify → generate
├─ packages/
│  ├─ core/                    # DOMAIN: types, weakness taxonomy, detectors, profile aggregation, adapter INTERFACES, prompts
│  ├─ adapters/                # LichessGameSource, StockfishEngine, GeminiFlashProvider, Resend, PostHog (+ mocks)
│  ├─ db/                      # Prisma schema, client, migrations
│  └─ config/                  # env parsing (Zod), typed config, provider selection
├─ e2e/                        # Playwright funnel tests
├─ .github/workflows/          # CI
├─ package.json / pnpm-workspace.yaml
└─ README.md
```

---

## 13. API surface (MVP)

Keep it small. REST-style route handlers in `apps/web/app/api`:

| Method / route | Purpose |
|---|---|
| `POST /api/signup` | body: `{ email, lichessUser, consent }` → create/lookup User, send magic link, create AnalysisJob, return job id. |
| `GET /api/job/:id` | poll job status/stage for the progress screen. |
| `GET /api/report/:slug` | fetch rendered report (increments viewCount). Public-but-unguessable. |
| `POST /api/analyze` | authed: start a new AnalysisJob for existing user ("analyze new games"). |
| `POST /api/interest` | fake-door: record WTP click `{ tier }` → PostHog + DB. |
| `POST /api/auth/*` | magic-link callback (Auth.js/Supabase). |
| `DELETE /api/me` | delete user + data. |

Validate every body with Zod; return typed errors.

---

## 14. Build order for Claude Code (do in this sequence)

Each step ends in something runnable/testable. Do not jump ahead.

1. **Scaffold monorepo** — pnpm workspaces, TypeScript strict, ESLint/Prettier, `packages/config` (Zod env), CI skeleton, Sentry stub.
2. **DB package** — Prisma schema (§10), migrations, client.
3. **Core domain (no I/O)** — types, error taxonomy + detectors (§9.2), CPL scoring, WeaknessProfile aggregation. **Unit tests against PGN fixtures.** This is the highest-value code — do it carefully.
4. **Adapter interfaces + mocks** — `LlmProvider`, `ChessEngine`, `GameSource`, `Analytics`, `Mailer` with `Mock*` implementations. Wire provider selection via config.
5. **Lichess adapter** — `LichessGameSource` with backoff + tests (record/replay fixtures).
6. **Stockfish adapter** — `StockfishNativeEngine` (UCI, pooled) + WASM fallback; eval budgeting.
7. **Gemini adapter** — `GeminiFlashProvider` behind `LlmProvider`; JSON-schema report prompt in `core`; retry/timeout/cost-logging wrapper; graceful-degradation template path.
8. **Worker pipeline** — staged, idempotent job runner (fetch→parse→evaluate→classify→generate→persist); status/stage updates; per-game failure isolation.
9. **Web: API routes** (§13) with Zod validation; enqueue jobs.
10. **Web: auth** (magic link) + email (Resend) for "report ready."
11. **Web: landing page** — value prop, CTA, fake-door, privacy/consent; SSG.
12. **Web: progress screen + report view** — poll job; render report with Chessground boards; share link.
13. **Analytics instrumentation** — PostHog events for the full funnel (§2) + retention identify on return.
14. **e2e funnel test** (Playwright) with mock adapters: signup → job → report → interest click.
15. **Polish + deploy** — Vercel (web) + Render/Fly (worker) + Neon/Supabase (db); env wiring; seed a demo report; verify metrics flow into PostHog.

**Definition of Done (MVP):** a real user can enter email + Lichess username, receive a correct, real-position weakness report within minutes, return via link, click the fake-door — and every step is visible in PostHog.

---

## 15. Analytics event schema (instrument exactly these) [MVP]

`landing_view`, `cta_click`, `signup_submitted`, `signup_completed`, `job_started`, `job_completed`, `job_failed`, `report_viewed` (with `is_return` bool), `report_shared`, `reanalyze_clicked`, `interest_clicked` (with `tier`), `feedback_submitted`. Identify users by hashed email; build retention cohorts on `report_viewed`.

---

## 16. Environment / configuration

Typed, Zod-validated in `packages/config`. Required env (names indicative):
`DATABASE_URL`, `LLM_PROVIDER`, `LLM_MODEL`, `GEMINI_API_KEY`, `ENGINE_KIND` (`native|wasm`), `STOCKFISH_PATH`, `LICHESS_USER_AGENT`, `POSTHOG_KEY`, `POSTHOG_HOST`, `RESEND_API_KEY`, `EMAIL_FROM`, `SENTRY_DSN`, `AUTH_SECRET`, `APP_URL`, `MAX_GAMES_PER_JOB`, `ENGINE_MOVETIME_MS`.

---

## 17. Risks specific to the build

- **Engine cost/latency blowup** — mitigate via eval budgeting, reusing Lichess evals, and capping games/job. Monitor per-job compute.
- **LLM hallucinating chess** — mitigate via strict grounding + JSON schema + deterministic rendering + template fallback.
- **Detector false positives** — mitigate via fixture-based tests and win-probability-aware thresholds.
- **Lichess rate limits / outages** — backoff, caching, clear user messaging.
- **Scope creep into P2 features** — enforce §3.2. The MVP's job is measurement.

---

# Future phases (roadmap — do NOT build during MVP)

Listed here so the whole plan lives in one document. Gate each phase on the prior phase's validation.

## Phase 2 — The core coaching product [P2] *(only if MVP validates)*
Turn the one-shot report into an ongoing product for the **adult improver beachhead (≈800–1600)**.
- **Adaptive weekly training plan** generated from the weakness profile ("this week: back-rank awareness + this endgame").
- **Targeted drills from the user's own games** + thematically matched master positions.
- **Plain-language "why" coaching** on demand for any position (grounded engine + LLM).
- **Accountability loop** — streaks, weekly check-ins, measurable rating-gain tracking (the category's real unsolved problem).
- **Chess.com game source** (`ChessComGameSource`) + **PGN upload**.
- **Accounts & payments** — subscription (Stripe), free diagnostic → paid plan. Convert the fake-door into a real door.
- **Spaced-repetition review** for recurring error themes.
- Harden the engine tier (dedicated eval service, deeper analysis, caching layer).

## Phase 3 — Human-like coaching & the beginner journey [P3]
- **Maia / Maia-2 integration** (behind `ChessEngine`/new `HumanModel` interface) for **style-aware sparring**, "what a player like you would do," and blunder prediction — the differentiation vs. plain Stockfish.
- **Zero-to-1500 guided curriculum** — the "school not a library" on-ramp: a single adaptive path, plain-language lessons, mastery tracking (second beachhead / funnel top).
- **Conversational coach** during play (Dr. Wolf-style, but integrated into the improvement plan).
- Live "play a coached game" mode (Chessground + engine/Maia) with real-time feedback.

## Phase 4 — Depth, scale & platform [P4]
- **Advanced-player module (1800–2200):** opening-prep depth, conversion technique, defense, time management, style diagnosis — highest willingness-to-pay cohort.
- **Native mobile apps** (React Native / Capacitor over the same core).
- **Coach/parent dashboards, teams, cohorts**; potential B2B (clubs, academies, scholastic).
- **Localization / i18n.**
- **Content & community** as retention (only once the coaching core is proven).
- Model/eval infra scaling; possible fine-tuned individual-behavior models per the recent research.

## Sequencing principle
Each phase is gated on evidence: MVP proves *demand*; P2 proves *retention + willingness to pay*; P3 expands *segments*; P4 scales *platform*. Never build the next phase before the current one's metric clears.

---

## 18. Open assumptions to confirm (flagged, non-blocking)

1. **Lichess-first** for import (largest free, easiest API). Chess.com deferred to P2 — confirm this matches your target users' primary platform.
2. **Magic-link auth** (email is the asset). If you'd rather reduce friction further, an anonymous session + email-gate-at-report is an alternative — tell me if you prefer that.
3. **Separate worker service** for Stockfish (D1). If you want a single Vercel deploy, we'd cap analysis small and run WASM — cheaper infra, slower/limited analysis.
4. **Gemini Flash** default confirmed; interface makes swaps trivial.
5. **~20–40 games/report** default batch — tune after first cost measurements.

*Nothing here blocks starting §14. These only affect a few defaults.*
