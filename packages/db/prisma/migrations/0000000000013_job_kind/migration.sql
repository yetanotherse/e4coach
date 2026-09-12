-- Job.kind separates full analysis runs from lightweight plan-regeneration
-- jobs (dashboard retry CTA); planStatus/planError record Stage 7's outcome
-- so a silently-failed plan can be retried from the UI.
ALTER TABLE "AnalysisJob" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'analysis',
ADD COLUMN "planStatus" TEXT,
ADD COLUMN "planError" TEXT;
