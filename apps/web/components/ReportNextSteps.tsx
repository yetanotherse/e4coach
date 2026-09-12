/**
 * Report-page bottom CTA: next steps after reading the report. The report was
 * automatically turned into this week's training plan, so the CTA is sign in →
 * open the plan → solve drills. Replaces the old fake-door waitlist on the
 * report page (the fake-door remains available in code for future use).
 */
export function ReportNextSteps() {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold">Your training plan is ready</h2>
        <p className="mt-4 text-lg text-neutral-600">
          This report was automatically turned into this week&apos;s training plan: drills from the
          exact positions above, puzzles matched to your weak spots, and spaced-repetition review so
          the fixes stick — with streaks and rating tracking to keep you going.
        </p>
        <ol className="mt-8 space-y-4 text-left">
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
          href="/login"
          className="mt-8 inline-block rounded-lg bg-brand px-6 py-3 text-lg font-semibold text-white transition hover:bg-brand-dark"
        >
          Sign in to see your training plan
        </a>
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: 'Sign in',
    body: 'Use the email you signed up with for this analysis — we\'ll send you a sign-in link or a 6-digit code.',
  },
  {
    title: 'Open this week\'s plan',
    body: 'Your dashboard shows your active training plan, built straight from the weaknesses in this report.',
  },
  {
    title: 'Solve drills and keep your streak',
    body: 'Revisit the positions you got wrong, review them before you forget, and check in weekly to track your rating.',
  },
];
