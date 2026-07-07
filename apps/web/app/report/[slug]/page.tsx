import { notFound } from 'next/navigation';
import type { ReportContent, WeaknessProfile } from '@chess-coach/core';
import { prisma } from '@/lib/server';
import { MoveExample } from '@/components/MoveExample';
import { ShareBar } from '@/components/ShareBar';
import { FakeDoor } from '@/components/FakeDoor';
import { PageView } from '@/components/PageView';

function scopeLine(scope: WeaknessProfile['scope']): string | null {
  if (!scope) return null;
  const perf = scope.perfTypes.join(', ');
  const dates =
    scope.dateFrom && scope.dateTo
      ? ` played ${fmt(scope.dateFrom)}–${fmt(scope.dateTo)}`
      : '';
  const skipped = scope.skipped > 0 ? ` ${scope.skipped} were skipped (non-standard or unreadable).` : '';
  return `Analyzed your ${scope.gamesAnalyzed} most recent rated games (${perf})${dates}.${skipped}`;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const dynamic = 'force-dynamic';

async function loadReport(slug: string) {
  const report = await prisma.report.findUnique({ where: { publicSlug: slug } });
  if (!report) return null;
  const isReturn = report.viewCount > 0; // seen before this load
  await prisma.report.update({
    where: { publicSlug: slug },
    data: { viewCount: { increment: 1 } },
  });
  return { report, isReturn };
}

export default async function ReportPage({ params }: { params: { slug: string } }) {
  const loaded = await loadReport(params.slug);
  if (!loaded) notFound();
  const { report, isReturn } = loaded;

  const content = report.content as unknown as ReportContent;
  const profile = report.profile as unknown as WeaknessProfile;
  const scope = scopeLine(profile.scope);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <PageView event="report_viewed" props={{ slug: params.slug, is_return: isReturn }} />

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{content.headline}</h1>
          <p className="mt-2 text-neutral-600">{content.intro}</p>
          {scope && <p className="mt-2 text-sm text-neutral-500">{scope}</p>}
        </div>
        <ShareBar />
      </header>

      {content.degraded && (
        <p className="mt-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
          This report was generated from the analysis engine directly.
        </p>
      )}
      {content.confidenceNote && (
        <p className="mt-4 rounded-lg bg-neutral-100 px-4 py-2 text-sm text-neutral-600">
          {content.confidenceNote}
        </p>
      )}

      <div className="mt-10 space-y-12">
        {content.weaknesses.map((w, i) => (
          <section key={w.category}>
            <h2 className="text-xl font-semibold">
              <span className="mr-2 text-brand">#{i + 1}</span>
              {w.title}
            </h2>
            <p className="mt-2 text-neutral-700">{w.explanation}</p>
            <div className="mt-3 rounded-lg bg-brand/5 px-4 py-3">
              <p className="text-sm">
                <strong className="text-brand-dark">Work on this:</strong> {w.recommendation}
              </p>
            </div>

            {w.examples.length > 0 && (
              <div className="mt-5 grid gap-6 sm:grid-cols-2">
                {w.examples.map((ex) => (
                  <MoveExample key={`${ex.gameId}-${ex.ply}`} ex={ex} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      <section className="mt-16">
        <FakeDoor reportSlug={params.slug} />
      </section>
    </main>
  );
}
