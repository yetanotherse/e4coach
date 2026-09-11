-- Row Level Security on the phase-2 tables (plans/phase-2.md, cross-cutting).
-- Same convention as 0000000000004_enable_rls: the app connects as the
-- `postgres` superuser (BYPASSRLS), so web + worker are unaffected. With RLS
-- enabled and NO policies, the Supabase anon/authenticated roles (PostgREST)
-- are denied all access, closing the public REST exposure.
-- NOTE: deliberately NOT using FORCE ROW LEVEL SECURITY — that would also apply
-- to the table owner (postgres) and break the app.
--
-- Review of pre-phase-2 tables (2026-09): User, AnalysisJob, Game, Report,
-- Interest (and _prisma_migrations) already have RLS enabled with no policies —
-- correct posture, unchanged here. The tables below are everything added in
-- phase 2 that was missing it, including the implicit Drill↔PlanItem join
-- table, which would otherwise leak drill↔plan links via PostgREST.

ALTER TABLE "AuthChallenge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RateLimitBucket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrainingPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Drill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DrillAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Puzzle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvalCache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Streak" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CheckIn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RatingSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_DrillToPlanItem" ENABLE ROW LEVEL SECURITY;
