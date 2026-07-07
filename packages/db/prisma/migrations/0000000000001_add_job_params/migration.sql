-- Add per-job user selection params (maxGames, perfTypes) — spec feedback #6
ALTER TABLE "AnalysisJob" ADD COLUMN "params" JSONB;
