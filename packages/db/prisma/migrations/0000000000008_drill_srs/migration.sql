-- Spaced repetition on Drill (plans/phase-2.md 2.3): SM-2-lite state.
-- Existing drills get defaults (interval 0, ease 2.5, due now) so every
-- previously created drill is immediately due — a sane migration backfill.

-- AlterTable
ALTER TABLE "Drill" ADD COLUMN     "intervalDays" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN     "ease" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    ADD COLUMN     "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN     "lastReviewedAt" TIMESTAMP(3),
    ADD COLUMN     "reviewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Drill_userId_dueAt_idx" ON "Drill"("userId", "dueAt");
