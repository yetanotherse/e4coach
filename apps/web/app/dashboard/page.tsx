import Link from 'next/link';
import { prisma } from '@/lib/server';
import { getSessionUserId } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { DashboardActions } from '@/components/DashboardActions';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const userId = getSessionUserId();

  if (!userId) {
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="mt-2 text-neutral-600">
          Enter the email you signed up with and we&apos;ll send you a link to your reports.
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </main>
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { reports: { orderBy: { createdAt: 'desc' } } },
  });

  if (!user) {
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <p className="text-neutral-600">Session expired. Please sign in again.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Your reports</h1>
          <p className="mt-1 text-neutral-600">
            {user.lichessUser ? `Lichess: ${user.lichessUser}` : 'No Lichess username on file'}
          </p>
        </div>
        <DashboardActions />
      </div>

      <ul className="mt-10 space-y-3">
        {user.reports.length === 0 && (
          <li className="text-neutral-500">No reports yet — analyze your games to get started.</li>
        )}
        {user.reports.map((r) => (
          <li key={r.id}>
            <Link
              href={`/report/${r.publicSlug}`}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 hover:border-brand"
            >
              <span>Report from {new Date(r.createdAt).toLocaleDateString()}</span>
              <span className="text-sm text-brand">View →</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
