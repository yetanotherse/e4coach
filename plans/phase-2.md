# Phase 2 Plan — The Core Coaching Product

*Owner: Shishir · Status: approved 2026-09 · Builds on the shipped MVP (see `chess-coach-spec.md` §14, now complete)*

> Going forward, each phase gets its own plan file in `plans/` (e.g. `plans/phase-3.md`). This file is the source of truth for Phase 2; the spec remains the source of truth for MVP scope and architecture principles (§0, §5.2, §8, §11.6).

## Decisions locked (owner-confirmed 2026-09)

| # | Decision |
|---|---|
| D-P2-1 | **Auth**: magic link (already built) wired into signup **plus** email OTP (6-digit) as an alternative; 30-day sliding session. |
| D-P2-2 | **Payments DEFERRED.** No gateway code (Stripe or otherwise). Keep neutral stubs/hooks (entitlements, pricing tiers, a `Billing` port) so any gateway can plug in later. Fake-door stays for now. |
| D-P2-3 | **Paywall shape (when built)**: free = weakness reports; paid = coaching (plans/drills/SRS/accountability). `Interest.tier` monthly/annual values already encode intent. |
| D-P2-4 | **Drills**: user's own games first + thematically matched positions from the **Lichess puzzle DB (CC-BY)**, ingested as a filtered per-theme slice. |
| D-P2-5 | **Build order**: strictly 2.0 → 2.1 → 2.2 → 2.3 → 2.4; each sub-phase ends shippable + tested. |
| D-P2-6 | PGN upload is already shipped (MVP+); it is NOT re-planned. |

## Current-state baseline (what exists as of this plan)

- Working MVP: landing → signup → Lichess/study/PGN import → Stockfish analysis → weakness profile → Gemini report → shareable report view; PostHog funnel; Resend email; DB-poll worker with staged idempotent pipeline.
- **Auth exists but is incomplete**: HMAC magic link + 30-day session in `apps/web/lib/auth.ts` (`/api/auth/request|callback|logout`), but **signup never sends the magic link**, no middleware, no rate limiting, no Sentry SDK, no OTP.
- Hooks already in place for Phase 2: `Game` table (drill source), `WeaknessProfile` JSON, detector taxonomy (SRS keys), `deepen.ts`/`explain.ts` (why-coaching), `DEEP_ANALYSIS_*` env tier, `chessComUser` column.

---

## 2.0 — Auth completion + platform hardening *(DONE 2026-09)*

**Goal:** every user ends up with a real session; abuse surface closed; observability live.

1. **Signup sends magic link** — ✅ `POST /api/signup` emails a magic sign-in link (fire-and-forget, subject notes the report is being analyzed).
2. **Email OTP** — ✅ `POST /api/auth/otp/request` + `POST /api/auth/otp/verify`; hashed single-use 10-min codes in new `AuthChallenge` table (`0000000000005_auth_and_rate_limit` migration), 5-attempt cap, enumeration-safe, replay-protected. `LoginForm` now has link/code tabs.
3. **Sliding session** — ✅ `apps/web/middleware.ts` re-issues the 30-day cookie when < 15 days remain (Web Crypto HMAC in `lib/tokenEdge.ts` since middleware runs on Edge).
4. **Route guarding** — intentionally kept decentralized: `/analyzing/[jobId]` and `/report/[slug]` are capabilities during first-run flows (middleware only renews; see 2.0.4 note in the file).
5. **Rate limiting** — ✅ DB-backed fixed-window upsert (`RateLimitBucket` table, `lib/rateLimit.ts`), applied to auth/otp/signup/interest/track via `rateLimit()` in `lib/server.ts`; `RATE_LIMIT_ENABLED=false` for e2e stacks. Fails open on DB errors.
6. **Sentry** — ✅ `@sentry/node` init in `lib/server.ts` (web) and `worker/main.ts`; server-runtime error capture only (no client-side Sentry, no perf tracing yet). Skipped the `instrumentation.ts` hook — its module graph pulled Prisma into a non-external bundle.
7. **Stretch (CI e2e, deploy hooks)** — ⬜ deferred to a later pass.

**Verification done:** lint/typecheck/233 unit tests green (incl. new otp/rateLimit/tokenEdge tests); web build green with middleware; live smoke: otp request → verify → httpOnly 30-day session cookie set → replay rejected; rate-limit upsert verified against Supabase; signup smoke with mock mailer. OTP happy-path e2e is impractical (mock mailer is in-process) — covered by unit tests + manual smoke instead.

## 2.1 — Chess.com game source *(DONE 2026-09)*

1. **`ChessComGameSource`** ✅ — `packages/adapters/src/chesscom/`: archives list (sorted newest-first — the API returns them unsorted) walked newest→oldest until `max` collected; Zod-validated responses; rules=chess + rated/time_class filters; 429/5xx backoff with Retry-After; `[ECO]` code from PGN tags (the API's `eco` field is a URL); per-move clocks parsed from `[%clk]` PGN comments into centiseconds (enables the TIME_TROUBLE detector); injectable fetch with fixture tests.
2. **Wiring** ✅ — `createGameSourceFor(env, source)` factory (mock env → always mock, so dev/e2e are unaffected); worker `RunDeps.chessComSource` + per-source username checks in the FETCHING stage; poller passes `chessComUser`.
3. **UI + routes** ✅ — `SignupSchema` gained `source` + `chessComUser` (superRefine requires the matching username); signup/analyze routes create jobs with the chosen platform (env default respected for backward compat); `SignupForm` gets a Lichess/Chess.com toggle; `DashboardActions` gets a platform select limited to usernames on file.

**Verification done:** 11 new adapter tests + 3 runner tests (chesscom success path, missing username, missing source config); live smoke against the real Chess.com API (20 games fetched and mapped correctly); lint/typecheck/244 tests/web build green.

## 2.2 — Training plans + drills (the core value; largest)

> **Decision (owner-confirmed 2026-09): 2.2 is split into two independently shippable halves.**
> - **2.2a — Own-game plans & drills:** `TrainingPlan`/`PlanItem`/`Drill`/`DrillAttempt` schema; deterministic plan generator (WeaknessProfile → weekly plan, template goals with optional LLM phrasing behind the existing port); drills sourced from the user's own game mistakes (report examples → positions); plan page + Chessground solve UI. **Shipped first.**
> - **2.2b — Puzzle drills + polish:** Lichess puzzle DB ingestion (theme-tag filtered slice → `Puzzle` table), thematic master-position drills mixed into weekly plans, drill scoring/accuracy feedback, eval cache (`EvalCache`) for drill re-evaluation.
> Rationale: 2.2a delivers the full coach loop (profile → plan → drill → solve) on data we already have; 2.2b adds the external content slice without blocking the core loop.

### 2.2a — DONE (2026-09)

1. **Schema** ✅ — migration `0000000000006_training_plans`: `TrainingPlan` (one active per user+weekStart; re-analysis supersedes), `PlanItem` (theme + goal), `Drill` (**user-owned**, m-n linked to plan items, deduped by userId+theme+fen+solutionUci so drills survive re-analysis and can recur weekly — SRS-ready), `DrillAttempt`.
2. **Core plan module** ✅ — `buildPlanDraft(profile)`: top themes by impact (≤2), drills from real report examples (≤5/theme), Monday-UTC weekStart, template goals from `CATEGORY_META`; `prompts/plan.ts` LLM goal phrasing with the report prompt's grounding contract (unknown themes rejected; any failure → template goals).
3. **Worker** ✅ — `pipeline/plan.ts` runs after report persist; failure logged, never fails the job.
4. **Web** ✅ — `/plan` (focus themes, goals, drill list with ✓ solved state, "Continue training" → first unsolved drill); `/plan/drill/[id]` solve flow (user-owned check, interactive Chessground with legal-move dests, wrong-try snap-back + attempt recorded, hint after 3 tries or on demand, grounded note + "you had played X" on solve); `POST /api/drills/[id]/attempt` (session-owner enforced, Zod-validated); dashboard "This week's plan" card; `drill_attempted`/`drill_solved` analytics events.

**Verification done:** unit tests (weekStart math, theme focus/caps, drill facts copied verbatim, skip-empty themes, goal counts); 254 tests + lint + typecheck + web build green; live full-stack smoke (mock adapters): signup → job → report → plan auto-created with 7 deduped drills across 2 themes, correctly linked.

1. **Schema:** `TrainingPlan` (userId, weekStart, sourceReportId, status), `PlanItem` (theme/taxonomy id, goal prose, drill refs), `Drill` (userId, type `own_game | puzzle`, sourceGameId/puzzleId, fen, solution line, taxonomy theme), `DrillAttempt` (drillId, solved, moveAccuracy, timeSpent).
2. **Plan generator** (`packages/core`): WeaknessProfile → weekly plan (top 2 themes × 4–6 drills each); LLM (existing `LlmProvider` port, JSON-schema, grounding contract) writes goals/motivation only; deterministic assembly + template fallback.
3. **Own-game drills:** reuse stored `Game` rows + `ErrorInstance` examples; solve flow = position FEN + "find the move you missed", feedback via existing engine eval + `explain.ts` narration.
4. **Lichess puzzle DB ingestion:** bulk download → filter by theme tags mapped to our taxonomy → per-theme pools in a `Puzzle` table; separate ingestion script + adapter.
5. **Solve UI:** Chessground drill player (make the move / short forced line, immediate engine + "why" feedback); plan page on dashboard.
6. **Eval cache** (`EvalCache` keyed by FEN+depth) introduced here for drill re-evaluation.

**Verification:** fixture-driven unit tests for plan assembly + drill scoring; Playwright: report → plan → solve a drill.

## 2.3 — Spaced repetition

- SM-2-lite scheduling on `Drill` (interval, ease, dueAt), review-queue page ("review due drills"), recurring-theme resurfacing in weekly plans, `review_completed` analytics.

## 2.4 — Accountability loop

- `Streak`/`CheckIn` models, weekly check-in flow, rating tracking (Lichess rating history; Chess.com equivalent), simple progress chart, weekly nudge email via existing `Mailer` port.

## 2.5 — Payments stubs/hooks only *(port shipped in 2.0; gateway deferred)*

- **Built:** `Billing` port in `packages/core` (`getEntitlement` → `{ tier, canUseCoaching }`), `MockBilling` adapter + `createBilling` factory + `BILLING_PROVIDER=mock` env, singleton wired into `apps/web/lib/server.ts`. **No gateway SDK, no checkout, no webhooks.**
- **Deferred (future plan file):** actual gateway integration (Stripe or alternative), subscription sync, billing portal, real `/pricing` page. The `Billing` port makes the choice a pure adapter task.

---

## Cross-cutting rules (inherited from spec)

- Ports & adapters everywhere; no vendor SDKs in domain code (applies to billing too).
- Zod at every boundary; TypeScript strict; tests alongside code; conventional commits.
- Rate-limit, backoff, and graceful-degradation every external call.
- Analytics events added per sub-phase (plan_generated, drill_solved, review_completed, checkin_done, streak_extended…).
