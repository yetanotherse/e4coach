-- CreateTable
CREATE TABLE "TrainingPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceReportId" TEXT,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "goal" TEXT NOT NULL,

    CONSTRAINT "PlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Drill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'own_game',
    "theme" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "sideToMove" TEXT NOT NULL,
    "solutionUci" TEXT NOT NULL,
    "solutionSan" TEXT,
    "playedMoveSan" TEXT,
    "gameId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Drill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrillAttempt" (
    "id" TEXT NOT NULL,
    "drillId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "solved" BOOLEAN NOT NULL,
    "playedUci" TEXT,
    "timeSpentMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrillAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DrillToPlanItem" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DrillToPlanItem_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "TrainingPlan_userId_weekStart_idx" ON "TrainingPlan"("userId", "weekStart");

-- CreateIndex
CREATE INDEX "TrainingPlan_userId_status_idx" ON "TrainingPlan"("userId", "status");

-- CreateIndex
CREATE INDEX "PlanItem_planId_idx" ON "PlanItem"("planId");

-- CreateIndex
CREATE INDEX "Drill_userId_theme_idx" ON "Drill"("userId", "theme");

-- CreateIndex
CREATE INDEX "DrillAttempt_drillId_idx" ON "DrillAttempt"("drillId");

-- CreateIndex
CREATE INDEX "DrillAttempt_userId_idx" ON "DrillAttempt"("userId");

-- CreateIndex
CREATE INDEX "_DrillToPlanItem_B_index" ON "_DrillToPlanItem"("B");

-- AddForeignKey
ALTER TABLE "TrainingPlan" ADD CONSTRAINT "TrainingPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPlan" ADD CONSTRAINT "TrainingPlan_sourceReportId_fkey" FOREIGN KEY ("sourceReportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TrainingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drill" ADD CONSTRAINT "Drill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrillAttempt" ADD CONSTRAINT "DrillAttempt_drillId_fkey" FOREIGN KEY ("drillId") REFERENCES "Drill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrillAttempt" ADD CONSTRAINT "DrillAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DrillToPlanItem" ADD CONSTRAINT "_DrillToPlanItem_A_fkey" FOREIGN KEY ("A") REFERENCES "Drill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DrillToPlanItem" ADD CONSTRAINT "_DrillToPlanItem_B_fkey" FOREIGN KEY ("B") REFERENCES "PlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

