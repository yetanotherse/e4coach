-- Pre-imported games for study/PGN sources (Phase F)
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "pgn" TEXT NOT NULL,
    "white" TEXT NOT NULL,
    "black" TEXT NOT NULL,
    "userColor" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "timeControl" TEXT NOT NULL,
    "speed" TEXT,
    "gameUrl" TEXT,
    "playedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Game_jobId_idx" ON "Game"("jobId");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
