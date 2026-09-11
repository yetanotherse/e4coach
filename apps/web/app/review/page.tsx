import Link from 'next/link';
import { CATEGORY_META } from '@chess-coach/core';
import { prisma } from '@/lib/server';
import { getSessionUserId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

/**
 * Review queue (plans/phase-2.md 2.3): drills whose SM-2-lite schedule marks
 * them due, most overdue first. Solving a due drill re-schedules it (the
 * attempt route advances the drill's SRS state and emits review_completed).
 * Paginated so a long-absent user can see every due drill, not just the first
 * few; `?page=N` (1-based) selects the page.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams?: { page?: string };
}) {
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

  const total = await prisma.drill.count({ where: { userId, dueAt: { lte: new Date() } } });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number.parseInt(searchParams?.page ?? '1', 10);
  const page = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), pageCount) : 1;

  const due = await prisma.drill.findMany({
    where: { userId, dueAt: { lte: new Date() } },
    orderBy: { dueAt: 'asc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold">Review queue</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {total === 0
          ? 'Nothing due right now — spaced repetition works.'
          : `${total} drill${total === 1 ? '' : 's'} due for review`}
      </p>

      {total > 0 && page === 1 && (
        <div className="mt-6 rounded-lg bg-brand/10 px-4 py-3">
          <Link
            href={`/plan/drill/${due[0]!.id}?from=review`}
            className="font-semibold text-brand-dark hover:underline"
          >
            Start review →
          </Link>
        </div>
      )}

      <ul className="mt-8 space-y-2">
        {due.map((d) => {
          const meta = CATEGORY_META[d.theme as keyof typeof CATEGORY_META];
          return (
            <li key={d.id}>
              <Link
                href={`/plan/drill/${d.id}?from=review`}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 hover:border-brand"
              >
                <span className="text-sm">
                  <span className="font-medium">{meta?.displayName ?? d.theme}</span>
                  <span className="text-neutral-400">
                    {' '}
                    · {d.type === 'puzzle' ? 'puzzle' : 'your game'}
                  </span>
                  <span className="block text-xs text-neutral-500">{dueLabel(d.dueAt)}</span>
                </span>
                <span className="text-sm text-brand">Review →</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {pageCount > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={`/review?page=${page - 1}`} className="text-brand hover:underline">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-neutral-500">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={`/review?page=${page + 1}`} className="text-brand hover:underline">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}

      <Link href="/plan" className="mt-10 inline-block text-sm text-neutral-500 underline">
        ← Back to plan
      </Link>
    </main>
  );
}

/** Human "how overdue" label for a due drill. */
function dueLabel(dueAt: Date): string {
  const days = Math.floor((Date.now() - dueAt.getTime()) / 86_400_000);
  if (days <= 0) return 'Due today';
  return `Overdue by ${days} day${days === 1 ? '' : 's'}`;
}
