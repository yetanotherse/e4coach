/**
 * Homepage bottom CTA: "How do I get started?" — the three-step onboarding
 * story, with a smooth-scroll link back to the game-import panel at the top
 * of the page (#import). Replaces the old fake-door waitlist box on the
 * landing page (the fake-door remains on the report page).
 */
export function GetStarted() {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold md:text-4xl">How do I get started?</h2>
        <ol className="mt-6 space-y-4 text-left">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand font-semibold text-white">
                {i + 1}
              </span>
              <span>
                <strong>{step.title}.</strong> {step.body}
              </span>
            </li>
          ))}
        </ol>
        <a
          href="#import"
          className="mt-8 inline-block rounded-lg bg-brand px-6 py-3 text-lg font-semibold text-white transition hover:bg-brand-dark"
        >
          Analyze my games — free
        </a>
        <p className="mt-3 text-xs text-neutral-500">
          We only ever read your <strong>public</strong> games. Your email is used to send your
          report and nothing else.
        </p>
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: 'Get your free weakness report',
    body: 'Import your recent Lichess or Chess.com games (or upload a PGN) and get your top weakness patterns, in plain language, with your own positions.',
  },
  {
    title: 'Get your weekly training plan',
    body: 'Your report automatically becomes this week\'s plan: your weakest themes, concrete goals, and drills built from your own mistakes.',
  },
  {
    title: 'Drill, review, and track your rating',
    body: 'Solve your drills, review them before you forget, check in weekly — and watch your rating chart answer whether it\'s working.',
  },
];
