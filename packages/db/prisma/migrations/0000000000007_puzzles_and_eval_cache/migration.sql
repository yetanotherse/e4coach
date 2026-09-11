-- AlterTable
ALTER TABLE "Drill" ADD COLUMN     "puzzleId" TEXT;

-- CreateTable
CREATE TABLE "Puzzle" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "solutionUci" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "themes" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Puzzle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalCache" (
    "fen" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "evalJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvalCache_pkey" PRIMARY KEY ("fen","depth","kind")
);

-- CreateIndex
CREATE UNIQUE INDEX "Puzzle_externalId_key" ON "Puzzle"("externalId");

-- CreateIndex
CREATE INDEX "Puzzle_category_rating_idx" ON "Puzzle"("category", "rating");

