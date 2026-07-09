import { notFound } from 'next/navigation';
import type { AnalysisScope, ReportContent, WeaknessProfile } from '@chess-coach/core';
import { prisma } from '@/lib/server';
import { MoveExample } from '@/components/MoveExample';
import { ShareBar } from '@/components/ShareBar';
import { PrintButton } from '@/components/PrintButton';
import { FakeDoor } from '@/components/FakeDoor';
import { PageView } from '@/components/PageView';

/** e.g. "Rapid" for one type, "Mixed: blitz, rapid" for several. */
function gameTypeLabel(scope: AnalysisScope): string | null {
  const types = scope.gameTypes?.length ? scope.gameTypes : scope.perfTypes;
  if (!types.length) return null;
  if (types.length === 1) return cap(types[0]!);
  return `Mixed: ${types.join(', ')}`;
}

function scopeLine(scope: WeaknessProfile['scope']): string | null {
  if (!scope) return null;
  const analyzed = scope.gameTypes?.length ? scope.gameTypes : scope.perfTypes;
  const typePhrase = analyzed.length === 1 ? `${analyzed[0]} ` : '';
  const dates =
    scope.dateFrom && scope.dateTo ? ` played ${fmt(scope.dateFrom)}–${fmt(scope.dateTo)}` : '';
  const skipped =
    scope.skipped > 0 ? ` ${scope.skipped} were skipped (non-standard or unreadable).` : '';
  // If the user requested types that didn't appear in their most-recent games,
  // say so — otherwise a bullet-heavy player who picked 3 types is confused.
  const requested = scope.perfTypes ?? [];
  const missing = requested.filter((t) => !analyzed.includes(t));
  const selectionNote =
    missing.length > 0 && requested.length > 1
      ? ` You selected ${requested.join(', ')}, but your most recent games were all ${analyzed.join(', ')}.`
      : '';
  return `Analyzed your ${scope.gamesAnalyzed} most recent rated ${typePhrase}games${dates}.${skipped}${selectionNote}`;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
  const gameType = profile.scope ? gameTypeLabel(profile.scope) : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <PageView event="report_viewed" props={{ slug: params.slug, is_return: isReturn }} />

      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-brand">
            {profile.username && (
              <span>
                Analysis for {profile.username} on{' '}
                {profile.source === 'lichess' ? 'Lichess' : profile.source}
              </span>
            )}
            {gameType && (
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand-dark">
                {gameType}
              </span>
            )}
          </p>
          <h1 className="mt-1 text-3xl font-bold">{content.headline}</h1>
          <p className="mt-2 text-neutral-600">{content.intro}</p>
          {scope && <p className="mt-2 text-sm text-neutral-500">{scope}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2 print:hidden">
          <PrintButton />
          <ShareBar />
        </div>
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
                {w.examples.map((ex) => {
                  const g = content.games?.[ex.gameId];
                  return (
                    <MoveExample
                      key={`${ex.gameId}-${ex.ply}`}
                      ex={ex}
                      {...(g
                        ? {
                            fullGame: {
                              pgn: g.pgn,
                              userColor: g.userColor,
                              ...(g.event ? { event: g.event } : {}),
                            },
                          }
                        : {})}
                    />
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>

      <section className="mt-16 print:hidden">
        <FakeDoor reportSlug={params.slug} />
      </section>
    </main>
  );
}
