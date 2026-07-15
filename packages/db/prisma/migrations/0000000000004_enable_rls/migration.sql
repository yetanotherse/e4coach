-- Enable Row Level Security on all public tables.
-- The app connects as the `postgres` superuser (BYPASSRLS), so web + worker are
-- unaffected. With RLS enabled and NO policies, the Supabase anon/authenticated
-- roles (PostgREST) are denied all access, closing the public REST exposure.
-- NOTE: deliberately NOT using FORCE ROW LEVEL SECURITY — that would also apply to
-- the table owner (postgres) and break the app.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnalysisJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Game" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Report" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Interest" ENABLE ROW LEVEL SECURITY;
