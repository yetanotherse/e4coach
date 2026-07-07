import { SignupForm } from '@/components/SignupForm';
import { FakeDoor } from '@/components/FakeDoor';
import { PageView } from '@/components/PageView';

const STEPS = [
  { title: 'We import your games', body: 'Your recent public Lichess games — no password, no OAuth.' },
  { title: 'We find your patterns', body: 'A chess engine reviews every move to pinpoint what costs you rating.' },
  { title: 'You get a clear plan', body: 'Your top 3 weaknesses, in plain language, with your own positions.' },
];

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <PageView event="landing_view" />

      <section className="grid items-center gap-12 md:grid-cols-2">
        <div>
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">
            Find the weaknesses costing you rating.
          </h1>
          <p className="mt-4 text-lg text-neutral-600">
            A personal chess coach that turns your own games into a clear, honest report — free.
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
          <SignupForm />
        </div>
      </section>

      <section className="mt-16">
        <FakeDoor />
      </section>
    </main>
  );
}
