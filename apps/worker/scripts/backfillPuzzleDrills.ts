/**
 * One-time data fix for puzzle drills created before the Lichess convention
 * was handled (see scripts/ingestPuzzles.ts header). Old rows store the
 * opponent's setup move as solutionUci, derive sideToMove from the raw FEN's
 * turn field (the opponent!), and have no solutionLine. This rewrites every
 * puzzle drill from its source Puzzle row, preserving attempt history and
 * SRS state. Idempotent — safe to re-run.
 *
 * Usage (from apps/worker):
 *   npx tsx scripts/backfillPuzzleDrills.ts
 */
import { lichessPuzzleFrom, sanForUci } from '@chess-coach/core';
import { prisma } from '@chess-coach/db';

async function main(): Promise<void> {
  const drills = await prisma.drill.findMany({
    where: { type: 'puzzle', puzzleId: { not: null } },
    select: { id: true, puzzleId: true },
  });
  console.log(`[backfill] found ${drills.length} puzzle drills`);

  let fixed = 0;
  let skipped = 0;
  for (const drill of drills) {
    const puzzle = await prisma.puzzle.findUnique({
      where: { externalId: drill.puzzleId! },
      select: { fen: true, line: true },
    });
    if (!puzzle) {
      console.warn(`[backfill] drill ${drill.id}: puzzle ${drill.puzzleId} not found — skipped`);
      skipped++;
      continue;
    }
    const pz = lichessPuzzleFrom(puzzle.fen, puzzle.line);
    if (!pz) {
      console.warn(`[backfill] drill ${drill.id}: puzzle ${drill.puzzleId} malformed — skipped`);
      skipped++;
      continue;
    }
    await prisma.drill.update({
      where: { id: drill.id },
      data: {
        fen: pz.fen,
        sideToMove: pz.sideToMove,
        solutionUci: pz.solutionUci,
        solutionSan: sanForUci(pz.fen, pz.solutionUci),
        solutionLine: pz.solutionLine,
      },
    });
    fixed++;
  }

  console.log(`[backfill] done: fixed ${fixed}, skipped ${skipped}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backfill] failed:', err);
    process.exit(1);
  });
