/**
 * Homepage "position insight" section: the position-type breakdown feature.
 * Where CoreIdea explains *what* mistakes recur, this explains *where* they
 * cluster — the pawn structures and position types in which the player errs
 * far above their own baseline (e.g. "isolated pawns → 2.1× your usual rate").
 * Presentational; same on-brand palette and board idioms as CoreIdea. Sits
 * directly below CoreIdea on the landing page.
 */

// Brand palette (shared with CoreIdea / assets/e4coach-design-tokens.md).
const INDIGO_300 = '#949BE6';
const INDIGO = '#4F5BD5';
const INDIGO_DARK = '#343C9E';
const RED = '#DC2626';
const MUTED = '#6B7280';

/**
 * Structural contexts the feature detects (packages/core structure.ts taxonomy),
 * grouped the way a coach would talk about them.
 */
const CONTEXT_GROUPS: { heading: string; items: string[] }[] = [
  { heading: 'Pawn structure', items: ['Isolated pawns', 'Isolated queen pawn', 'Doubled pawns', 'Passed pawns'] },
  { heading: 'Position type', items: ['Open positions', 'Closed positions', 'Open files'] },
  { heading: 'King safety', items: ['Opposite-side castling', 'Exposed king'] },
  { heading: 'Endgames', items: ['Rook endgames', 'King & pawn', 'Minor-piece', 'Opposite bishops'] },
];

/**
 * Illustrative "lift" chart: the player's mistake rate per position type against
 * their own baseline. Bars above the dashed baseline are the actionable spikes.
 * Numbers are illustrative marketing art, not a real report.
 */
const BASELINE = 0.18;
const LIFT_BARS: { label: string; rate: number }[] = [
  { label: 'Isolated pawns', rate: 0.38 },
  { label: 'Open files', rate: 0.29 },
  { label: 'Rook endgames', rate: 0.24 },
  { label: 'Open positions', rate: 0.19 },
  { label: 'Closed positions', rate: 0.11 },
  { label: 'Queenless', rate: 0.09 },
];

const CHART = { top: 34, bottom: 196, left: 96, right: 772, max: 0.42 };

/** Map a 0..max rate to a y coordinate in the chart band. */
function rateToY(rate: number): number {
  const span = CHART.bottom - CHART.top;
  return CHART.bottom - (rate / CHART.max) * span;
}

/** Bars per position type vs a dashed personal-baseline line. */
function LiftChart() {
  const n = LIFT_BARS.length;
  const slot = (CHART.right - CHART.left) / n;
  const barW = slot * 0.5;
  const baseY = rateToY(BASELINE);

  return (
    <svg
      viewBox="0 0 800 250"
      className="h-auto w-full"
      style={{ fontFamily: 'var(--font-body)' }}
      role="img"
      aria-labelledby="pi-title pi-desc"
    >
      <title id="pi-title">Mistake rate by position type versus your baseline</title>
      <desc id="pi-desc">
        For each kind of position, e4coach compares how often you err against your own overall
        mistake rate, so the structures where you slip most — such as isolated pawns and open files —
        rise to the top.
      </desc>

      {/* baseline: the player's own average mistake rate */}
      <line
        x1={CHART.left - 12}
        y1={baseY}
        x2={CHART.right + 8}
        y2={baseY}
        stroke={INDIGO}
        strokeWidth={2}
        strokeDasharray="5 5"
      />
      <text x={CHART.left - 16} y={baseY - 6} textAnchor="start" fill={INDIGO_DARK} fontSize={12} fontWeight={600}>
        Your usual rate
      </text>

      {LIFT_BARS.map((bar, i) => {
        const cx = CHART.left + slot * i + slot / 2;
        const x = cx - barW / 2;
        const y = rateToY(bar.rate);
        const above = bar.rate > BASELINE;
        const lift = bar.rate / BASELINE;
        return (
          <g key={bar.label}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={CHART.bottom - y}
              rx={6}
              fill={above ? RED : INDIGO_300}
              opacity={above ? 0.85 : 0.6}
            />
            {above && (
              <text x={cx} y={y - 8} textAnchor="middle" fill={RED} fontSize={13} fontWeight={700}>
                {lift.toFixed(1)}×
              </text>
            )}
            <text x={cx} y={CHART.bottom + 18} textAnchor="middle" fill={MUTED} fontSize={11.5}>
              {bar.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function PositionInsight() {
  return (
    <div>
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium text-brand">Going deeper</p>
        <h2 className="mt-2 text-3xl font-bold md:text-4xl">Not just what — but where.</h2>
        <p className="mt-4 text-lg text-neutral-600">
          Knowing you hang pieces is useful. Knowing you hang them mostly in{' '}
          <strong>isolated-pawn positions</strong> or <strong>rook endgames</strong> tells you exactly
          what to study. e4coach tags every position by its structure and finds the ones where you
          slip <em>far more than usual</em>.
        </p>
      </div>

      <figure className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <LiftChart />
        <figcaption className="mt-3 text-center text-sm text-neutral-500">
          Each position type compared to <strong>your own</strong> mistake rate — the tall red bars
          are the structures quietly costing you the most.
        </figcaption>
      </figure>

      <div className="mt-10 text-center">
        <p className="text-sm font-medium text-neutral-500">The positions we look at</p>
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {CONTEXT_GROUPS.map((group) => (
            <div key={group.heading}>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">
                {group.heading}
              </p>
              <ul className="mt-2 flex flex-wrap justify-center gap-2">
                {group.items.map((item) => (
                  <li
                    key={item}
                    className="rounded-full bg-brand/10 px-3 py-1 text-sm font-medium text-brand-dark"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-sm text-neutral-500">
          Only structures where you have enough games to be sure are shown — so you get a real
          signal, not noise from a single bad day.
        </p>
      </div>
    </div>
  );
}
