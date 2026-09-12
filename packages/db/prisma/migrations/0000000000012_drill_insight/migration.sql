-- AlterTable
ALTER TABLE "Drill" ADD COLUMN     "explanation" JSONB,
ADD COLUMN     "variations" JSONB,
ADD COLUMN     "cpBefore" INTEGER,
ADD COLUMN     "cpAfter" INTEGER;
