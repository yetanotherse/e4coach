/**
 * Homepage "phase 2" section: the ongoing coaching loop that turns the one-shot
 * weakness report into a weekly training habit — plans, drills from your own
 * games, themed puzzles, spaced repetition, and accountability (streaks +
 * rating tracking). Presentational; same on-brand palette and icon idioms as
 * CoreIdea. Sits below PositionInsight on the landing page.
 */

// Brand palette (shared with CoreIdea / assets/e4coach-design-tokens.md).
const MIST = '#ECEDFB';
const INDIGO_300 = '#949BE6';
const INDIGO_100 = '#DCDEF7';
const INDIGO = '#4F5BD5';
const INDIGO_DARK = '#343C9E';
const RED = '#DC2626';
const AMBER = '#D97706';

/** Small icon: a plan sheet with two checked goals. */
function IconPlan() {
  return (
    <svg viewBox="0 0 56 56" className="h-12 w-12" aria-hidden="true">
      <rect x={12} y={6} width={32} height={44} rx={4} fill={MIST} stroke={INDIGO} strokeWidth={2.5} />
      <circle cx={21} cy={18} r={4.5} fill="none" stroke={INDIGO} strokeWidth={2.5} />
      <path d="M18.8 18 l1.7 1.8 l3 -3.4" stroke={INDIGO} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <line x1={29} y1={17} x2={39} y2={17} stroke={INDIGO_300} strokeWidth={3} strokeLinecap="round" />
      <circle cx={21} cy={32} r={4.5} fill={INDIGO} />
      <path d="M18.8 32 l1.7 1.8 l3 -3.4" stroke="#FFFFFF" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <line x1={29} y1={31} x2={39} y2={31} stroke={INDIGO_300} strokeWidth={3} strokeLinecap="round" />
      <line x1={18} y1={44} x2={38} y2={44} stroke={INDIGO_100} strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

/** Small icon: a branded 4×4 board with one highlighted "solve this" square. */
function IconDrill() {
  const s = 9; // square size → 4×4 = 36px board
  return (
    <svg viewBox="0 0 56 56" className="h-12 w-12" aria-hidden="true">
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3].map((c) => (
          <rect
            key={`${r}-${c}`}
            x={10 + c * s}
            y={10 + r * s}
            width={s}
            height={s}
            fill={(r + c) % 2 === 0 ? MIST : INDIGO_300}
          />
        )),
      )}
      <rect x={10 + 2 * s} y={10 + 1 * s} width={s} height={s} fill={RED} opacity={0.75} />
      <rect x={10} y={10} width={4 * s} height={4 * s} rx={2} fill="none" stroke={INDIGO} strokeWidth={2.5} />
      <circle cx={28} cy={28} r={2.8} fill={INDIGO_DARK} />
    </svg>
  );
}

/** Small icon: a puzzle piece. */
function IconPuzzle() {
  return (
    <svg viewBox="0 0 56 56" className="h-12 w-12" aria-hidden="true">
      <path
        d="M14 14 h10 a5 5 0 1 1 8 0 h10 v10 a5 5 0 1 0 0 8 v10 h-28 z"
        fill={MIST}
        stroke={INDIGO}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Small icon: a circular arrow (spaced repetition). */
function IconReview() {
  return (
    <svg viewBox="0 0 56 56" className="h-12 w-12" aria-hidden="true">
      <path
        d="M28 10 a18 18 0 1 0 18 18"
        fill="none"
        stroke={INDIGO}
        strokeWidth={3.5}
        strokeLinecap="round"
      />
      <path d="M28 4 l9 6 l-9 6 z" fill={INDIGO} />
      <circle cx={28} cy={28} r={5} fill={AMBER} />
    </svg>
  );
}

/** Small icon: a rising rating line with a flame-ish dot (streak). */
function IconStreak() {
  return (
    <svg viewBox="0 0 56 56" className="h-12 w-12" aria-hidden="true">
      <rect x={6} y={34} width={9} height={14} rx={2} fill={INDIGO_100} />
      <rect x={19} y={28} width={9} height={20} rx={2} fill={INDIGO_300} />
      <rect x={32} y={20} width={9} height={28} rx={2} fill={INDIGO} />
      <rect x={45} y={12} width={5} height={36} rx={2} fill={INDIGO_DARK} />
      <circle cx={30} cy={10} r={4} fill={AMBER} />
    </svg>
  );
}

/** Small icon: two overlapping platform chips (Lichess + Chess.com import). */
function IconImport() {
  return (
    <svg viewBox="0 0 56 56" className="h-12 w-12" aria-hidden="true">
      <rect x={6} y={12} width={26} height={26} rx={5} fill={MIST} stroke={INDIGO} strokeWidth={2.5} />
      {[0, 1].map((r) =>
        [0, 1].map((c) => (
          <rect key={`${r}-${c}`} x={11 + c * 8} y={17 + r * 8} width={8} height={8} fill={(r + c) % 2 === 0 ? INDIGO_300 : MIST} />
        )),
      )}
      <rect x={24} y={22} width={26} height={26} rx={5} fill={INDIGO} />
      {[0, 1].map((r) =>
        [0, 1].map((c) => (
          <rect key={`${r}-${c}`} x={29 + c * 8} y={27 + r * 8} width={8} height={8} fill={(r + c) % 2 === 0 ? INDIGO_300 : INDIGO} />
        )),
      )}
    </svg>
  );
}

const FEATURES: { icon: React.ReactNode; title: string; body: string }[] = [
  {
    icon: <IconPlan />,
    title: 'A weekly training plan',
    body: 'Every report becomes a plan for the week: your two weakest themes, concrete goals, and the drills to work on — refreshed each time you re-analyze.',
  },
  {
    icon: <IconDrill />,
    title: 'Drills from your own games',
    body: 'Revisit the exact positions where you went wrong and find the move you missed — with a hint when you need it and a plain-language "why" when you solve it.',
  },
  {
    icon: <IconPuzzle />,
    title: 'Themed puzzles, matched to you',
    body: 'Your plan mixes in puzzles hand-picked from the Lichess puzzle database for the themes you keep getting wrong — not random tactics, targeted ones.',
  },
  {
    icon: <IconReview />,
    title: 'Spaced repetition',
    body: 'Drills you solve come back right before you would forget them. Easy solves drift out over weeks; shaky ones return tomorrow until they stick.',
  },
  {
    icon: <IconStreak />,
    title: 'Streaks & rating tracking',
    body: 'A weekly check-in keeps you honest, streaks keep you showing up, and your rating chart shows whether the work is paying off.',
  },
  {
    icon: <IconImport />,
    title: 'Lichess, Chess.com, or PGN',
    body: 'Import recent games from either platform, analyze your Lichess studies, or upload PGN files — whatever is already yours.',
  },
];

export function CoachingFeatures() {
  return (
    <div>
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium text-brand">Beyond the report</p>
        <h2 className="mt-2 text-3xl font-bold md:text-4xl">A coach, not just a report.</h2>
        <p className="mt-4 text-lg text-neutral-600">
          A report tells you what to fix. e4coach goes further: it turns your weaknesses into a{' '}
          <strong>weekly training plan</strong>, drills you on the exact positions you got wrong, and
          brings them back until they stick — with streaks and rating tracking to keep you going.
        </p>
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            {f.icon}
            <h3 className="mt-3 text-lg font-semibold">{f.title}</h3>
            <p className="mt-1 text-neutral-600">{f.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
