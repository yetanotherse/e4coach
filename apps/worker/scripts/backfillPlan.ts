/**
 * One-off repair for users whose report exists but whose weekly training plan
 * was never created — Stage 7 (plan generation) used to fail silently, leaving
 * the dashboard with a report link but no plan (runner.ts logged a warn only).
 * This regenerates the plan from the user's latest stored report profile.
 *
 * Idempotent in effect: generateTrainingPlan supersedes any existing plan for
 * the same week, drills are deduped, so re-running is safe. Note: without a
 * configured engine the puzzle-drill insight pass is skipped (own-game drills
 * still carry their full insight from the report).
 *
 * Usage (from apps/worker):
 *   npx tsx scripts/backfillPlan.ts <userId>
 */
import '../src/loadEnv.js';
import { createLlmProvider } from '@chess-coach/adapters';
import { loadEnv } from '@chess-coach/config';
import { prisma } from '@chess-coach/db';
import { generateTrainingPlan } from '../src/pipeline/plan.js';
import type { WeaknessProfile } from '@chess-coach/core';

async function main(): Promise<void> {
  const userId = process.argv[2];
  if (!userId) {
    console.error('[backfill-plan] usage: npx tsx scripts/backfillPlan.ts <userId>');
    process.exit(1);
  }

  const report = await prisma.report.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, jobId: true, createdAt: true, profile: true },
  });
  if (!report) {
    console.error(`[backfill-plan] no report found for user ${userId}`);
    process.exit(1);
  }
  console.log(
    `[backfill-plan] using report ${report.id} (created ${report.createdAt.toISOString()})`,
  );

  const env = loadEnv();
  const llm = createLlmProvider(env);
  const planId = await generateTrainingPlan(
    prisma,
    { userId, profile: report.profile as unknown as WeaknessProfile, reportId: report.id },
    llm,
    new Date(),
  );

  if (planId) {
    console.log(`[backfill-plan] plan ${planId} created for user ${userId}`);
    await prisma.analysisJob
      .update({
        where: { id: report.jobId },
        data: { planStatus: 'created', planError: null },
      })
      .catch(() => {});
  } else {
    console.log('[backfill-plan] no drillable weaknesses in this profile — no plan generated');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backfill-plan] failed:', err);
    process.exit(1);
  });
