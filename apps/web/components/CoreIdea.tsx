/**
 * Homepage "core idea" section: why pattern analysis across many games beats
 * reviewing one game at a time. Presentational; on-brand custom SVG art (single
 * indigo accent + the app's own board palette). Sits between the hero and the
 * waitlist on the landing page.
 */

// Brand palette (from assets/e4coach-design-tokens.md). Semantic red = mistake.
const MIST = '#ECEDFB';
const INDIGO_300 = '#949BE6';
const INDIGO_100 = '#DCDEF7';
const INDIGO = '#4F5BD5';
const INDIGO_DARK = '#343C9E';
const RED = '#DC2626';
const MUTED = '#6B7280';

/** The real weakness categories the product detects (packages/core taxonomy). */
const PATTERNS = [
  'Hanging pieces',
  'Missed tactics',
  'Opening inaccuracies',
  'Failing to convert',
  'Defending under pressure',
  'Endgame technique',
  'Time management',
  'Positional drift',
];

/** The six "your games" boards; `dots` are mistake squares as [col, row] on 8×8. */
const GAME_BOARDS: { x: number; y: number; dots: [number, number][] }[] = [
  { x: 20, y: 34, dots: [[4, 4]] },
  { x: 112, y: 34, dots: [[3, 5], [6, 2]] },
  { x: 204, y: 34, dots: [[5, 3]] },
  { x: 20, y: 126, dots: [[2, 2]] },
  { x: 112, y: 126, dots: [[4, 1], [1, 5]] },
  { x: 204, y: 126, dots: [[3, 4]] },
];

/** The ranked weakness bars on the right (proportional to how often they recur). */
const BARS = [
  { w: 316, label: 'Hanging pieces', n: 7 },
  { w: 250, label: 'Missed tactics', n: 5 },
  { w: 196, label: 'Weak defense', n: 4 },
];

const SQ = 10; // square size
const RANKS = 8;
const BOARD = SQ * RANKS; // 80 — a real 8×8 board

const FILES = Array.from({ length: RANKS }, (_, i) => i);

/** A real 8×8 chessboard in the brand board colors. */
function MiniBoard({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {FILES.map((r) =>
        FILES.map((c) => (
          <rect
            key={`${r}-${c}`}
            x={x + c * SQ}
            y={y + r * SQ}
            width={SQ}
            height={SQ}
            fill={(r + c) % 2 === 0 ? MIST : INDIGO_300}
          />
        )),
      )}
      <rect x={x} y={y} width={BOARD} height={BOARD} rx={2} fill="none" stroke={INDIGO_100} strokeWidth={1.5} />
    </g>
  );
}

/** Centerpiece: scattered mistakes across games → reviewed → ranked patterns. */
function PatternFlow() {
  const lens = { x: 330, y: 140, r: 33 };
  return (
    <svg
      viewBox="0 0 800 250"
      className="h-auto w-full"
      style={{ fontFamily: 'var(--font-body)' }}
      role="img"
      aria-labelledby="pf-title pf-desc"
    >
      <title id="pf-title">From scattered mistakes to ranked weakness patterns</title>
      <desc id="pf-desc">
        Six of your games each show mistakes; e4coach reviews every move and ranks the mistakes you
        repeat most, such as hanging pieces, missed tactics, and weak defense.
      </desc>

      {/* faint lines converging from each game into the review lens */}
      {GAME_BOARDS.map((b, i) => (
        <line
          key={i}
          x1={b.x + BOARD / 2}
          y1={b.y + BOARD / 2}
          x2={lens.x}
          y2={lens.y}
          stroke={INDIGO_100}
          strokeWidth={1.5}
        />
      ))}

      {/* left: your games, mistakes everywhere */}
      <text x={20} y={22} fill={MUTED} fontSize={13} fontWeight={500}>
        Your games
      </text>
      {GAME_BOARDS.map((b, i) => (
        <g key={i}>
          <MiniBoard x={b.x} y={b.y} />
          {b.dots.map(([c, r], j) => (
            <g key={j}>
              {/* flag the mistake square, then a dot centered on it */}
              <rect x={b.x + c * SQ} y={b.y + r * SQ} width={SQ} height={SQ} fill={RED} opacity={0.55} />
              <circle cx={b.x + c * SQ + SQ / 2} cy={b.y + r * SQ + SQ / 2} r={3} fill={RED} />
            </g>
          ))}
        </g>
      ))}

      {/* middle: the review "lens" */}
      <circle cx={lens.x} cy={lens.y} r={lens.r} fill={MIST} stroke={INDIGO} strokeWidth={4} />
      <line
        x1={lens.x + lens.r * 0.7}
        y1={lens.y + lens.r * 0.7}
        x2={lens.x + lens.r + 14}
        y2={lens.y + lens.r + 14}
        stroke={INDIGO}
        strokeWidth={5}
        strokeLinecap="round"
      />
      <text x={lens.x} y={lens.y + lens.r + 34} textAnchor="middle" fill={MUTED} fontSize={12}>
        Every move reviewed
      </text>

      {/* arrow into the ranked patterns */}
      <line x1={398} y1={140} x2={432} y2={140} stroke={INDIGO} strokeWidth={3} />
      <path d="M432 133 L446 140 L432 147 Z" fill={INDIGO} />

      {/* right: your recurring patterns, ranked */}
      <text x={456} y={44} fill={INDIGO_DARK} fontSize={14} fontWeight={600}>
        Your top patterns
      </text>
      {BARS.map((bar, i) => {
        const y = 60 + i * 58;
        return (
          <g key={bar.label}>
            <rect x={456} y={y} width={bar.w} height={40} rx={8} fill={INDIGO} opacity={1 - i * 0.14} />
            <text x={472} y={y + 25} fill="#FFFFFF" fontSize={15} fontWeight={600}>
              {bar.label}
            </text>
            <text x={456 + bar.w - 16} y={y + 25} textAnchor="end" fill="#FFFFFF" fontSize={14} fontWeight={600}>
              ×{bar.n}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Small icon: one game (real 8×8 board) under a magnifier (single-game analysis). */
function IconOneGame() {
  const s = 4; // square size → 8×4 = 32px board
  return (
    <svg viewBox="0 0 56 56" className="h-12 w-12" aria-hidden="true">
      {FILES.map((r) =>
        FILES.map((c) => (
          <rect
            key={`${r}-${c}`}
            x={6 + c * s}
            y={6 + r * s}
            width={s}
            height={s}
            fill={(r + c) % 2 === 0 ? MIST : INDIGO_300}
          />
        )),
      )}
      <rect x={6} y={6} width={s * RANKS} height={s * RANKS} rx={2} fill="none" stroke={INDIGO_100} strokeWidth={1.5} />
      <circle cx={37} cy={37} r={12} fill="#FFFFFF" stroke={INDIGO} strokeWidth={3} />
      <line x1={46} y1={46} x2={52} y2={52} stroke={INDIGO} strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

/** Small icon: many games with a highlighted recurring cluster. */
function IconAcrossGames() {
  return (
    <svg viewBox="0 0 56 56" className="h-12 w-12" aria-hidden="true">
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => (
          <rect
            key={`${r}${c}`}
            x={9 + c * 15}
            y={9 + r * 15}
            width={13}
            height={13}
            rx={2}
            fill={c < 2 && r < 2 ? INDIGO : INDIGO_100}
          />
        )),
      )}
    </svg>
  );
}

export function CoreIdea() {
  return (
    <div>
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium text-brand">The core idea</p>
        <h2 className="mt-2 text-3xl font-bold md:text-4xl">Fix the mistakes you keep repeating.</h2>
        <p className="mt-4 text-lg text-neutral-600">
          A single-game review tells you what went wrong in <em>that</em> game. e4coach reviews a
          batch of your games together, groups the mistakes, and shows the weakness{' '}
          <strong>patterns</strong> costing you the most rating — so you train the root cause, not
          one-off blunders.
        </p>
      </div>

      <figure className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <PatternFlow />
        <figcaption className="mt-3 text-center text-sm text-neutral-500">
          We review every move across your games and rank the mistakes you make most — so you know
          exactly what to work on.
        </figcaption>
      </figure>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <IconOneGame />
          <h3 className="mt-3 text-lg font-semibold">Most analysis looks at one game</h3>
          <p className="mt-1 text-neutral-600">
            An engine shows the best move and where you slipped — game by game. Helpful, but it&apos;s
            on you to notice what keeps happening.
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <IconAcrossGames />
          <h3 className="mt-3 text-lg font-semibold">e4coach looks across your games</h3>
          <p className="mt-1 text-neutral-600">
            We review every move in up to 25 games and cluster your mistakes, so your recurring
            habits rise to the top — each shown with your <strong>own</strong> positions.
          </p>
        </div>
      </div>

      <div className="mt-10 text-center">
        <p className="text-sm font-medium text-neutral-500">The patterns we look for</p>
        <ul className="mt-3 flex flex-wrap justify-center gap-2">
          {PATTERNS.map((p) => (
            <li
              key={p}
              className="rounded-full bg-brand/10 px-3 py-1 text-sm font-medium text-brand-dark"
            >
              {p}
            </li>
          ))}
        </ul>
        <p className="mx-auto mt-6 max-w-2xl text-sm text-neutral-500">
          <span className="mr-2 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand-dark">
            Beginner → ~1800
          </span>
          Built for beginners through intermediate players, where clear, repeated patterns are the
          easiest wins — and still useful for stronger players to catch their blind spots.
        </p>
      </div>
    </div>
  );
}
