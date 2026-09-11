/** A single rating datapoint for the chart (serialized from RatingSnapshot). */
export interface ChartPoint {
  ratedAt: number; // epoch ms
  rating: number;
}

export interface RatingChartProps {
  points: ChartPoint[];
  label: string; // e.g. "Lichess blitz"
}

const W = 600;
const H = 200;
const PAD = { top: 16, right: 16, bottom: 28, left: 48 };

/**
 * Simple server-rendered SVG line chart of rating over time (plans/phase-2.md
 * 2.4) — zero dependencies. One point renders as a labeled value; two or more
 * render as a polyline with min/max guides.
 */
export function RatingChart({ points, label }: RatingChartProps) {
  const sorted = [...points].sort((a, b) => a.ratedAt - b.ratedAt);

  if (sorted.length === 0) {
    return <p className="text-sm text-neutral-500">No rating data yet — check in to start tracking.</p>;
  }

  if (sorted.length === 1) {
    return (
      <p className="text-sm text-neutral-600">
        {label}: <span className="font-semibold text-neutral-900">{sorted[0]!.rating}</span> — check in weekly to build
        the trend line.
      </p>
    );
  }

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const ratings = sorted.map((p) => p.rating);
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  // Pad the rating band so the line doesn't hug the edges; keep ≥1 to avoid /0.
  const span = Math.max(1, max - min);
  const yMin = min - span * 0.1;
  const yMax = max + span * 0.1;
  const t0 = sorted[0]!.ratedAt;
  const t1 = sorted[sorted.length - 1]!.ratedAt;
  const tSpan = Math.max(1, t1 - t0);

  const x = (t: number) => PAD.left + ((t - t0) / tSpan) * innerW;
  const y = (r: number) => PAD.top + (1 - (r - yMin) / (yMax - yMin)) * innerH;
  const path = sorted.map((p) => `${x(p.ratedAt).toFixed(1)},${y(p.rating).toFixed(1)}`).join(' ');
  const last = sorted[sorted.length - 1]!;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label} rating over time`}>
        <line x1={PAD.left} y1={y(max)} x2={W - PAD.right} y2={y(max)} stroke="#e5e5e5" strokeDasharray="4 4" />
        <line x1={PAD.left} y1={y(min)} x2={W - PAD.right} y2={y(min)} stroke="#e5e5e5" strokeDasharray="4 4" />
        <text x={PAD.left - 6} y={y(max) + 4} textAnchor="end" fontSize="11" fill="#737373">
          {max}
        </text>
        <text x={PAD.left - 6} y={y(min) + 4} textAnchor="end" fontSize="11" fill="#737373">
          {min}
        </text>
        <polyline points={path} fill="none" stroke="#4F5BD5" strokeWidth="2" strokeLinejoin="round" />
        <circle cx={x(last.ratedAt)} cy={y(last.rating)} r="4" fill="#4F5BD5" />
        <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize="11" fill="#737373">
          {new Date(t1).toLocaleDateString()}
        </text>
        <text x={PAD.left} y={H - 8} fontSize="11" fill="#737373">
          {new Date(t0).toLocaleDateString()}
        </text>
      </svg>
      <figcaption className="text-sm text-neutral-600">
        {label}: <span className="font-semibold text-neutral-900">{last.rating}</span>
        <span className={last.rating >= sorted[0]!.rating ? 'text-green-600' : 'text-red-600'}>
          {' '}
          {last.rating >= sorted[0]!.rating ? '+' : ''}
          {last.rating - sorted[0]!.rating}
        </span>{' '}
        over {sorted.length} snapshots
      </figcaption>
    </figure>
  );
}
