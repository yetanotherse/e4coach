'use client';

import { useMemo, useState } from 'react';
import { ChessBoard } from './ChessBoard';
import { expandVariation } from '../lib/variations';

/** A stored engine line: start position + SAN. Mirrors core's `Variation`. */
export interface VariationData {
  kind: 'refutation' | 'best' | 'alternative';
  label: string;
  startFen: string;
  sans: string[];
  cp?: number;
  mate?: number;
}

/** Short tab label — the full label goes under the board. */
function tabLabel(v: VariationData): string {
  if (v.kind === 'refutation') return 'What happened';
  if (v.kind === 'best') return 'Better move';
  return v.sans[0] ?? 'Alternative';
}

function formatEval(v: VariationData): string | null {
  if (typeof v.mate === 'number') {
    return v.mate > 0 ? `mate in ${v.mate}` : `mated in ${Math.abs(v.mate)}`;
  }
  if (typeof v.cp !== 'number') return null;
  const pawns = (v.cp / 100).toFixed(1);
  return v.cp > 0 ? `+${pawns}` : pawns;
}

/**
 * Steppable engine lines on the board. Sub-1800 players are exactly the readers
 * least able to reconstruct a variation from notation alone, so the point here
 * is that they can watch the punishment happen rather than read about it.
 */
export function VariationTabs({
  variations,
  orientation,
}: {
  variations: VariationData[];
  orientation: 'white' | 'black';
}) {
  const [active, setActive] = useState(0);
  const [ply, setPly] = useState(0);

  const current = variations[active] ?? variations[0]!;
  const line = useMemo(
    () => expandVariation(current.startFen, current.sans),
    [current.startFen, current.sans],
  );

  const boardFen = line.fens[Math.min(ply, line.fens.length - 1)]!;
  // Highlight the move about to be played from the position on screen. The
  // whole refutation line is drawn red — it is the line that loses, including
  // the opponent's punishing replies. Green is reserved for lines that held,
  // matching the legend under the board.
  const nextUci = line.ucis[ply];
  const isLosingLine = current.kind === 'refutation';
  const evaluation = formatEval(current);

  const select = (index: number): void => {
    setActive(index);
    setPly(0);
  };

  return (
    <div>
      <div className="mx-auto max-w-[260px]">
        <ChessBoard
          fen={boardFen}
          orientation={orientation}
          playedUci={isLosingLine ? nextUci : undefined}
          betterUci={isLosingLine ? undefined : nextUci}
        />
      </div>

      <div className="mt-2 flex items-center justify-center gap-3 text-sm print:hidden">
        <button
          onClick={() => setPly((p) => Math.max(0, p - 1))}
          disabled={ply === 0}
          className="rounded border border-neutral-300 px-2 py-0.5 disabled:opacity-40"
          aria-label="Previous move"
        >
          ◀
        </button>
        <span className="min-w-[7rem] text-center text-neutral-700">
          {ply === 0 ? 'start' : line.sans[ply - 1]}
          {ply === line.fens.length - 1 && evaluation ? (
            <span className="ml-1 text-neutral-500">({evaluation})</span>
          ) : null}
        </span>
        <button
          onClick={() => setPly((p) => Math.min(line.fens.length - 1, p + 1))}
          disabled={ply >= line.fens.length - 1}
          className="rounded border border-neutral-300 px-2 py-0.5 disabled:opacity-40"
          aria-label="Next move"
        >
          ▶
        </button>
      </div>

      {variations.length > 1 && (
        <div className="mt-2 flex flex-wrap justify-center gap-1 print:hidden">
          {variations.map((v, i) => (
            <button
              key={`${v.kind}-${v.sans[0] ?? i}`}
              onClick={() => select(i)}
              aria-pressed={i === active}
              className={
                i === active
                  ? 'rounded-full bg-brand px-2.5 py-0.5 text-xs text-white'
                  : 'rounded-full border border-neutral-300 px-2.5 py-0.5 text-xs text-neutral-600 hover:border-neutral-400'
              }
            >
              {tabLabel(v)}
            </button>
          ))}
        </div>
      )}

      <p className="mt-2 text-center text-xs text-neutral-500">
        {current.label}: {current.sans.join(' ')}
      </p>
    </div>
  );
}
