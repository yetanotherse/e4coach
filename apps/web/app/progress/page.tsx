import Link from 'next/link';
import { weekStartFor } from '@chess-coach/core';
import { prisma } from '@/lib/server';
import { getSessionUserId } from '@/lib/auth';
import { CheckInButton } from '@/components/CheckInButton';
import { RatingChart } from '@/components/RatingChart';

export const dynamic = 'force-dynamic';

/**
 * Progress page (plans/phase-2.md 2.4): weekly check-in, streak, and the
 * rating chart built from snapshots taken at check-in time.
 */
export default async function ProgressPage() {
  const userId = getSessionUserId();
  if (!userId) {
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <h1 className="text-2xl font-bold">Sign in first</h1>
        <Link href="/dashboard" className="mt-4 inline-block text-brand underline">
          Go to sign in →
        </Link>
      </main>
    );
  }

  const [streak, snapshots, dueDrills] = await Promise.all([
    prisma.streak.findUnique({ where: { userId } }),
    prisma.ratingSnapshot.findMany({ where: { userId }, orderBy: { ratedAt: 'asc' } }),
    prisma.drill.count({ where: { userId, dueAt: { lte: new Date() } } }),
  ]);

  const weekStart = weekStartFor(new Date());
  const checkedInThisWeek = streak?.lastCheckInWeekStart?.getTime() === weekStart.getTime();

  // Group snapshots into series per (source, perf); chart the one with the
  // most data, list the rest as current values.
  const series = new Map<string, Array<{ ratedAt: number; rating: number }>>();
  for (const s of snapshots) {
    const key = `${s.source}:${s.perf}`;
    const arr = series.get(key) ?? [];
    arr.push({ ratedAt: s.ratedAt.getTime(), rating: s.rating });
    series.set(key, arr);
  }
  const seriesList = [...series.entries()].sort((a, b) => b[1].length - a[1].length);
  const main = seriesList[0];
  const mainLabel = main ? seriesLabel(main[0]) : null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold">Your progress</h1>

      <section className="mt-6 rounded-lg border border-neutral-200 bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold">
              {streak?.currentStreak ?? 0} week{(streak?.currentStreak ?? 0) === 1 ? '' : 's'} streak
            </p>
            <p className="text-sm text-neutral-500">
              Longest: {streak?.longestStreak ?? 0} · {dueDrills} drill{dueDrills === 1 ? '' : 's'} due for review
            </p>
          </div>
          <CheckInButton disabled={checkedInThisWeek} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Rating</h2>
        {main && mainLabel ? (
          <div className="mt-3 rounded-lg border border-neutral-200 bg-white px-4 py-4">
            <RatingChart points={main[1]} label={mainLabel} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">
            No rating snapshots yet — add your Lichess or Chess.com username and check in to start the chart.
          </p>
        )}
        {seriesList.length > 1 && (
          <p className="mt-2 text-sm text-neutral-500">
            Also tracked:{' '}
            {seriesList
              .slice(1)
              .map(([key, pts]) => `${seriesLabel(key)} ${pts[pts.length - 1]!.rating}`)
              .join(' · ')}
          </p>
        )}
      </section>

      <div className="mt-10 flex gap-4">
        <Link href="/dashboard" className="text-sm text-neutral-500 underline">
          ← Back to dashboard
        </Link>
        <Link href="/review" className="text-sm text-brand underline">
          Review due drills →
        </Link>
      </div>
    </main>
  );
}

/** 'lichess:blitz' → 'Lichess blitz' */
function seriesLabel(key: string): string {
  const [source, perf] = key.split(':');
  const platform = source === 'chesscom' ? 'Chess.com' : 'Lichess';
  return `${platform} ${perf ?? ''}`.trim();
}
