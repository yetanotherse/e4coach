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

### 2.2b — DONE (2026-09)

1. **Theme mapping** ✅ — `core/src/plan/puzzleThemes.ts`: Lichess puzzle theme tags → our 8-category taxonomy (TIME_TROUBLE intentionally absent — it's play skill, not solvable from a puzzle); conservative one-category-per-tag mapping.
2. **Ingestion** ✅ — `apps/worker/scripts/ingestPuzzles.ts`: streams `curl | zstd -dc` (or a local CSV), filters by mapped theme + rating band (800–1600) + popularity, upserts into `Puzzle`. **Ran live: 3,278 puzzles** across 7 categories (500 each, WEAK_DEFENSE 278 — the defensive-move tag pool is thinner). Refreshable anytime; defaults documented in the script header.
3. **Plan mixing** ✅ — `buildPlanDraft` accepts `puzzlesByTheme`/`puzzlesPerTheme` (default 2); puzzle drills append after own-game drills; a theme with no report examples but puzzle candidates is kept (pure-puzzle weeks); SAN derived via chess.js when missing; worker fetches candidates per focus theme from the Puzzle table (random-offset slice, best-effort). Drill dedupe now prefers `puzzleId`.
4. **Eval cache** ✅ — `EvalCache` table (PK fen+depth+kind, migration `0000000000007_puzzles_and_eval_cache`) + `createDbEvalCache` in the worker; `evaluateGame` consults it and writes back — **only at fixed depth** (movetime evals are non-deterministic and never cached).
5. **UI** ✅ — puzzle drills flagged in the solver; CC BY-SA attribution line for Lichess puzzle positions.

**Verification done:** 265 tests green (puzzle mixing, SAN derivation, side-to-move from FEN, eval-cache hit/write/skip-at-movetime); live: 3,278 puzzles ingested; direct plan-generation smoke against the real DB produced own-game + puzzle drills (SANs computed) including a puzzle-only theme.

> **Operational note discovered during smoke:** a real-env worker (the deployed Render worker) shares this Supabase DB with dev and will claim `PENDING` jobs from local dev signups within seconds — dev smokes should either run direct function calls (as done here) or use a separate dev database.

1. **Schema:** `TrainingPlan` (userId, weekStart, sourceReportId, status), `PlanItem` (theme/taxonomy id, goal prose, drill refs), `Drill` (userId, type `own_game | puzzle`, sourceGameId/puzzleId, fen, solution line, taxonomy theme), `DrillAttempt` (drillId, solved, moveAccuracy, timeSpent).
2. **Plan generator** (`packages/core`): WeaknessProfile → weekly plan (top 2 themes × 4–6 drills each); LLM (existing `LlmProvider` port, JSON-schema, grounding contract) writes goals/motivation only; deterministic assembly + template fallback.
3. **Own-game drills:** reuse stored `Game` rows + `ErrorInstance` examples; solve flow = position FEN + "find the move you missed", feedback via existing engine eval + `explain.ts` narration.
4. **Lichess puzzle DB ingestion:** bulk download → filter by theme tags mapped to our taxonomy → per-theme pools in a `Puzzle` table; separate ingestion script + adapter.
5. **Solve UI:** Chessground drill player (make the move / short forced line, immediate engine + "why" feedback); plan page on dashboard.
6. **Eval cache** (`EvalCache` keyed by FEN+depth) introduced here for drill re-evaluation.

**Verification:** fixture-driven unit tests for plan assembly + drill scoring; Playwright: report → plan → solve a drill.

## 2.3 — Spaced repetition *(DONE 2026-09)*

1. **Schema** ✅ — migration `0000000000008_drill_srs`: `Drill` gains SM-2-lite state (`intervalDays`, `ease`, `dueAt`, `lastReviewedAt`, `reviewCount`). Defaults backfill existing drills as due-now; new index `[userId, dueAt]`.
2. **SM-2-lite core** ✅ — `core/src/plan/srs.ts`: clean solve → 1d, then 3d, then interval × ease (cap 180d); grind solve (any failed tries since the last review) → ease −0.2 (floor 1.3), progress reset, back in 1d. Scheduling advances **only on the solve attempt** — wrong tries count as lapses for that solve, they don't reschedule by themselves.
3. **Wiring** ✅ — the attempt route updates the drill's SRS state after a solved attempt and emits `review_completed` (with lapses + next interval) when the solved drill was due; new-drill first solves count as reviews (dueAt defaults to now).
4. **Review queue** ✅ — `/review` lists due drills most-overdue-first ("Start review" → first due drill); the drill solver takes `?from=review` and returns to the queue; dashboard shows a "Review due drills" card when any are due.
5. **Recurring-theme resurfacing** ✅ — plan generation links up to 3 due drills per focus theme (most overdue first, `pickResurfaceDrills`) into the new week's plan items, on top of the fresh draft drills.

**Verification done:** 14 SRS unit tests + 5 plan-generation tests (resurfacing selection, caps, dedupe re-link preserves SRS state); 284 tests + lint + typecheck + web build green; migration deployed to Supabase; live smoke script (`apps/worker/scripts/srsSmoke.ts`, cleans up after itself): new drill due immediately → clean solve +1d → grind solve ease 2.3/reset → re-learn → second clean +3d, dueAt/lastReviewedAt persisted, selector filters by theme/excludes linked.

## 2.4 — Accountability loop *(DONE 2026-09)*

1. **Schema** ✅ — migration `0000000000009_accountability`: `Streak` (one per user; current/longest streak, `lastCheckInWeekStart`, `lastNudgeWeekStart` for nudge idempotency), `CheckIn` (unique per user+weekStart, Monday 00:00 UTC — same week math as plans), `RatingSnapshot` (unique per user+source+perf+ratedAt → idempotent writes; index for chart reads).
2. **Streak math** ✅ — `core/src/accountability.ts`: same-week check-in is a no-op; previous week extends; any longer gap resets to 1. `isNudgeDue` decides nudges purely from state.
3. **Rating tracking** ✅ — `RatingSource` port + adapters: `LichessRatingSource` (public `/api/user/{u}/rating-history`, day-granular; **field is `points`, not `values` — verified against the live API**; blitz/rapid/classical only) and `ChessComRatingSource` (public `/pub/player/{u}/stats` — no history endpoint exists, so the "equivalent" is the current rating per perf; the chart grows from check-in snapshots). `MockRatingSource` for dev/e2e (`GAME_SOURCE=mock` forces it, same rule as game sources). `snapshotRatings` (web lib) backfills ≤365 days on first sight, then appends only newer points; per-source failures are best-effort and never fail the check-in.
4. **Check-in flow** ✅ — `POST /api/checkin` (rate-limited, session user): idempotent per week via upsert; streak advances only on the first check-in of the week; `checkin_done` + `streak_extended` (when it grew) analytics. UI: `/progress` page (streak card + check-in button + zero-dep SVG rating chart of the largest snapshot series, other series listed as current values); dashboard card shows check-in CTA / streak state. **Auto check-in (2026-09):** the first solved drill of a week records the check-in too — manual button and drill solves share one idempotent path (`web/lib/checkin.ts`, the `CheckIn.create` unique constraint serializes the streak advance); `checkin_done`/`streak_extended` carry a `source` (`manual` | `drill`); rating snapshots run fire-and-forget on the auto path so drill solves stay fast. The nudge query is unchanged — "no check-in this week" now means "not engaged this week".
5. **Weekly nudge email** ✅ — worker `pipeline/nudge.ts` rides the poll loop (scanned at most once per `NUDGE_SCAN_INTERVAL_MS`, default hourly): users with ≥1 report, joined before this week, no check-in this week, not already nudged this week (≤ `NUDGE_MAX_PER_SCAN` per scan). Send failure = not marked nudged (retried next scan). Env: `NUDGE_ENABLED`/`NUDGE_SCAN_INTERVAL_MS`/`NUDGE_MAX_PER_SCAN`.

**Verification done:** 25 new tests (streak math, Lichess/Chess.com parsing incl. untracked-perf drops + 404/backoff, nudge selection/idempotency/cap/failure-retry); 309 tests + lint + typecheck + web build green; migration deployed to Supabase; live smoke (`apps/worker/scripts/accountabilitySmoke.ts`, self-cleaning) against real Lichess/Chess.com APIs + the real DB: 30-point Lichess backfill + Chess.com snapshot, re-snapshot idempotent, streak 1 → same-week no-op, check-in unique constraint enforced, nudge candidate query selects pre-check-in and excludes post-check-in.

> **Operational note:** the nudge scan is global by design — never run `sendWeeklyNudges` against the shared dev/prod DB manually (an early smoke did and marked 15 real users as nudged; reverted via SQL before any real email could go out — the smoke now checks candidacy without sending).

## 2.5 — Payments stubs/hooks only *(port shipped in 2.0; gateway deferred)*

- **Built:** `Billing` port in `packages/core` (`getEntitlement` → `{ tier, canUseCoaching }`), `MockBilling` adapter + `createBilling` factory + `BILLING_PROVIDER=mock` env, singleton wired into `apps/web/lib/server.ts`. **No gateway SDK, no checkout, no webhooks.**
- **Deferred (future plan file):** actual gateway integration (Stripe or alternative), subscription sync, billing portal, real `/pricing` page. The `Billing` port makes the choice a pure adapter task.

---

## Cross-cutting rules (inherited from spec)

- Ports & adapters everywhere; no vendor SDKs in domain code (applies to billing too).
- Zod at every boundary; TypeScript strict; tests alongside code; conventional commits.
- Rate-limit, backoff, and graceful-degradation every external call.
- Analytics events added per sub-phase (plan_generated, drill_solved, review_completed, checkin_done, streak_extended…).
- **RLS on every new table** (2026-09): each migration creating tables must `ENABLE ROW LEVEL SECURITY` on them — deny-all, no policies (the app's `postgres` owner role bypasses RLS; PostgREST anon/authenticated get nothing; see migrations 0004/0010). Guard: `pnpm --filter worker exec tsx scripts/checkRls.ts` asserts every public table has RLS — run after deploys / in CI.
