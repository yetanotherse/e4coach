import Link from 'next/link';
import { ImportPanel } from '@/components/ImportPanel';
import { PageView } from '@/components/PageView';
import { BrandLogo } from '@/components/BrandLogo';
import { CoreIdea } from '@/components/CoreIdea';
import { PositionInsight } from '@/components/PositionInsight';
import { CoachingFeatures } from '@/components/CoachingFeatures';
import { GetStarted } from '@/components/GetStarted';

const STEPS = [
  { title: 'We import your games', body: 'Your recent public Lichess or Chess.com games, studies, or PGN files — no password, no OAuth.' },
  { title: 'We find your patterns', body: 'A chess engine reviews every move to pinpoint what costs you rating.' },
  { title: 'You get a clear plan', body: 'Your top 3 weaknesses, in plain language, with your own positions.' },
];

export default function LandingPage({
  searchParams,
}: {
  searchParams: { studyError?: string };
}) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <PageView event="landing_view" />

      <header className="mb-12 flex items-center justify-between">
        <BrandLogo />
        <Link
          href="/login"
          className="rounded-lg bg-brand px-4 py-2 font-semibold text-white transition hover:bg-brand-dark"
        >
          Sign in
        </Link>
      </header>

      <section id="import" className="grid items-center gap-12 md:grid-cols-2">
        <div>
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">
            Find the weaknesses costing you rating.
          </h1>
          <p className="mt-4 text-lg text-neutral-600">
            A personal chess coach that turns your own games into a clear, honest report — and a
            weekly plan to fix them. Free to start.
          </p>
          <ul className="mt-6 space-y-2 text-neutral-700">
            {STEPS.map((s) => (
              <li key={s.title} className="flex gap-2">
                <span className="text-brand">✓</span>
                <span>
                  <strong>{s.title}.</strong> {s.body}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs text-neutral-500">
            We only ever read your <strong>public</strong> games. Your email is used to send your
            report and nothing else.
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <ImportPanel {...(searchParams.studyError ? { studyError: searchParams.studyError } : {})} />
        </div>
      </section>

      <section className="mt-16">
        <CoreIdea />
      </section>

      <section className="mt-16">
        <PositionInsight />
      </section>

      <section className="mt-16">
        <CoachingFeatures />
      </section>

      <section className="mt-16">
        <GetStarted />
      </section>
    </main>
  );
}
