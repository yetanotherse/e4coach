'use client';

import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { ChessBoard } from './ChessBoard';

/**
 * Full-game move-by-move viewer for study imports (no Lichess deep-link).
 * Reconstructs every position from the PGN with chess.js, lets the user step
 * through the whole game, and jumps straight to the flagged mistake with the
 * played (red) / better (green) arrows shown there.
 */
export function GameViewer({
  pgn,
  userColor,
  focusPly,
  playedUci,
  betterUci,
}: {
  pgn: string;
  userColor: 'white' | 'black';
  focusPly: number;
  playedUci?: string;
  betterUci?: string;
}) {
  const { fens, sans } = useMemo(() => buildPositions(pgn), [pgn]);
  const lastIndex = Math.max(0, fens.length - 1);
  const start = Math.min(focusPly, lastIndex);
  const [idx, setIdx] = useState(start);

  const atMistake = idx === focusPly;
  const moveLabel =
    idx === 0
      ? 'Start'
      : `${Math.ceil(idx / 2)}${idx % 2 === 1 ? '.' : '...'} ${sans[idx - 1] ?? ''}`;

  return (
    <div className="mt-2">
      <div className="mx-auto max-w-[260px]">
        <ChessBoard
          fen={fens[idx]!}
          orientation={userColor}
          playedUci={atMistake ? playedUci : undefined}
          betterUci={atMistake ? betterUci : undefined}
        />
      </div>
      <div className="mt-2 flex items-center justify-center gap-2 text-sm print:hidden">
        <button onClick={() => setIdx(0)} disabled={idx === 0} className={btn}>
          ⏮
        </button>
        <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className={btn}>
          ◀
        </button>
        <span className="min-w-[84px] text-center text-neutral-600">{moveLabel}</span>
        <button
          onClick={() => setIdx((i) => Math.min(lastIndex, i + 1))}
          disabled={idx === lastIndex}
          className={btn}
        >
          ▶
        </button>
        <button onClick={() => setIdx(lastIndex)} disabled={idx === lastIndex} className={btn}>
          ⏭
        </button>
      </div>
      <div className="mt-1 text-center print:hidden">
        <button onClick={() => setIdx(focusPly)} className="text-sm text-brand underline">
          Go to the mistake
        </button>
      </div>
    </div>
  );
}

const btn = 'rounded border border-neutral-300 px-2 py-0.5 disabled:opacity-40';

/** FEN before each ply, plus the final position; and SAN per ply. */
function buildPositions(pgn: string): { fens: string[]; sans: string[] } {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });
    if (history.length === 0) return { fens: [new Chess().fen()], sans: [] };
    const fens = history.map((m) => m.before);
    fens.push(history[history.length - 1]!.after);
    return { fens, sans: history.map((m) => m.san) };
  } catch {
    return { fens: [new Chess().fen()], sans: [] };
  }
}
