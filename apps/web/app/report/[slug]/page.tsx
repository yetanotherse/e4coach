import { notFound } from 'next/navigation';
import type { ReportContent } from '@chess-coach/core';
import { prisma } from '@/lib/server';
import { ChessBoard } from '@/components/ChessBoard';
import { ShareBar } from '@/components/ShareBar';
import { FakeDoor } from '@/components/FakeDoor';
import { PageView } from '@/components/PageView';

export const dynamic = 'force-dynamic';

async function loadReport(slug: string) {
  const report = await prisma.report.findUnique({ where: { publicSlug: slug } });
  if (!report) return null;
  await prisma.report.update({
    where: { publicSlug: slug },
    data: { viewCount: { increment: 1 } },
  });
  return report;
}

export default async function ReportPage({ params }: { params: { slug: string } }) {
  const report = await loadReport(params.slug);
  if (!report) notFound();

  const content = report.content as unknown as ReportContent;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <PageView event="report_viewed" props={{ slug: params.slug }} />

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{content.headline}</h1>
          <p className="mt-2 text-neutral-600">{content.intro}</p>
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
                  <figure key={`${ex.gameId}-${ex.ply}`} className="rounded-lg border border-neutral-200 p-3">
                    <div className="mx-auto max-w-[240px]">
                      <ChessBoard fen={ex.fen} bestMove={ex.betterMove} />
                    </div>
                    <figcaption className="mt-2 text-sm text-neutral-600">
                      Move {ex.moveNumber}: you played <strong>{ex.playedMove}</strong>.{' '}
                      {ex.gameUrl ? (
                        <a href={ex.gameUrl} target="_blank" rel="noopener noreferrer" className="text-brand underline">
                          View game
                        </a>
                      ) : null}
                    </figcaption>
                  </figure>
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
