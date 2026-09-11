import Link from 'next/link';
import { CATEGORY_META } from '@chess-coach/core';
import { prisma } from '@/lib/server';
import { getSessionUserId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * This week's training plan (plans/phase-2.md 2.2a): the latest plan for the
 * signed-in user with its focus themes, goals, and drills (solved state from
 * the user's own attempts).
 */
export default async function PlanPage() {
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

  const plan = await prisma.trainingPlan.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      items: {
        include: {
          drills: {
            include: { attempts: { where: { userId }, orderBy: { createdAt: 'desc' } } },
          },
        },
      },
    },
  });

  if (!plan || plan.items.length === 0) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24">
        <h1 className="text-2xl font-bold">No training plan yet</h1>
        <p className="mt-2 text-neutral-600">
          Analyze your games first — your plan is built from the weaknesses found in your own
          games.
        </p>
        <Link href="/dashboard" className="mt-6 inline-block text-brand underline">
          ← Back to dashboard
        </Link>
      </main>
    );
  }

  const allDrills = plan.items.flatMap((i) => i.drills);
  const solvedCount = allDrills.filter((d) => d.attempts.some((a) => a.solved)).length;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold">This week&apos;s plan</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Week of {new Date(plan.weekStart).toLocaleDateString()} ·{' '}
        {solvedCount}/{allDrills.length} drills solved
      </p>

      {allDrills.length > 0 && (
        <div className="mt-6 rounded-lg bg-brand/10 px-4 py-3">
          <Link
            href={`/plan/drill/${nextDrillId(plan.items)}`}
            className="font-semibold text-brand-dark hover:underline"
          >
            {solvedCount === 0 ? 'Start training →' : solvedCount === allDrills.length ? 'Review drills →' : 'Continue training →'}
          </Link>
        </div>
      )}

      <div className="mt-8 space-y-8">
        {plan.items.map((item) => {
          const meta = CATEGORY_META[item.theme as keyof typeof CATEGORY_META];
          return (
            <section key={item.id}>
              <h2 className="text-lg font-semibold">{meta?.displayName ?? item.theme}</h2>
              <p className="mt-1 text-sm text-neutral-600">{item.goal}</p>
              <ul className="mt-3 space-y-2">
                {item.drills.map((d) => {
                  const solved = d.attempts.some((a) => a.solved);
                  return (
                    <li key={d.id}>
                      <Link
                        href={`/plan/drill/${d.id}`}
                        className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 hover:border-brand"
                      >
                        <span className="text-sm">
                          {solved ? '✓' : '○'}{' '}
                          {solved && d.solutionSan ? `Find ${d.solutionSan}` : 'Find the better move'}
                          {d.playedMoveSan && (
                            <span className="text-neutral-400"> (instead of {d.playedMoveSan})</span>
                          )}
                        </span>
                        <span className="text-sm text-brand">{solved ? 'Review' : 'Solve'} →</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <Link href="/dashboard" className="mt-10 inline-block text-sm text-neutral-500 underline">
        ← Back to dashboard
      </Link>
    </main>
  );
}

/** First unsolved drill in item/drill order, else the first drill. */
function nextDrillId(
  items: Array<{ drills: Array<{ id: string; attempts: Array<{ solved: boolean }> }> }>,
): string {
  for (const item of items) {
    for (const d of item.drills) {
      if (!d.attempts.some((a) => a.solved)) return d.id;
    }
  }
  return items[0]!.drills[0]!.id;
}
