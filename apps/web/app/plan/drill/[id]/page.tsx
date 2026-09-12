import Link from 'next/link';
import { CATEGORY_META } from '@chess-coach/core';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/server';
import { getSessionUserId } from '@/lib/auth';
import { DrillSolver, type DrillData } from '@/components/DrillSolver';

export const dynamic = 'force-dynamic';

/** One drill, owned by the signed-in user only (plans/phase-2.md 2.2a). */
export default async function DrillPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { from?: string };
}) {
  const userId = getSessionUserId();
  if (!userId) {
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <h1 className="text-2xl font-bold">Sign in first</h1>
        <Link href="/login" className="mt-4 inline-block text-brand underline">
          Go to sign in →
        </Link>
      </main>
    );
  }

  const row = await prisma.drill.findUnique({ where: { id: params.id } });
  if (!row || row.userId !== userId) notFound();

  // For puzzle drills, the opponent's setup move (Puzzle.line[0]) produced the
  // drill position — highlighted at start for context. Derived at read time
  // from the source puzzle, no duplication on the Drill row.
  const puzzle =
    row.type === 'puzzle' && row.puzzleId
      ? await prisma.puzzle.findUnique({
          where: { externalId: row.puzzleId },
          select: { line: true },
        })
      : null;

  const meta = CATEGORY_META[row.theme as keyof typeof CATEGORY_META];
  const drill: DrillData = {
    id: row.id,
    type: row.type === 'puzzle' ? 'puzzle' : 'own_game',
    theme: row.theme,
    themeName: meta?.displayName ?? row.theme,
    fen: row.fen,
    sideToMove: row.sideToMove === 'black' ? 'black' : 'white',
    solutionUci: row.solutionUci,
    setupMoveUci: puzzle?.line.trim().split(/\s+/)[0] ?? null,
    solutionLine: row.solutionLine,
    solutionSan: row.solutionSan,
    playedMoveSan: row.playedMoveSan,
    gameId: row.gameId,
    note: row.note,
  };

  return (
    <main>
      <DrillSolver drill={drill} backHref={searchParams?.from === 'review' ? '/review' : '/plan'} />
    </main>
  );
}
