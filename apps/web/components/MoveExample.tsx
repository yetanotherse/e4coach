'use client';

import { useState } from 'react';
import { ChessBoard } from './ChessBoard';

/** Shape of an ErrorInstance example (subset the UI needs). */
export interface ExampleData {
  gameId: string;
  ply: number;
  moveNumber: number;
  fen: string;
  playedMove: string;
  playedMoveUci?: string;
  betterMove: string;
  betterMoveSan?: string;
  cpBefore: number;
  assessment: string;
  userColor: 'white' | 'black';
  gameUrl?: string;
  note: string;
  line?: { fens: string[]; sans: string[]; focusIndex: number };
}

/** Was the position already lost before the move? (spec feedback #4) */
function alreadyLost(cpBefore: number): boolean {
  return cpBefore <= -300;
}

export function MoveExample({ ex }: { ex: ExampleData }) {
  const [stepping, setStepping] = useState(false);
  const [idx, setIdx] = useState(ex.line?.focusIndex ?? 0);

  const line = ex.line;
  const atFocus = !stepping || !line || idx === line.focusIndex;
  const boardFen = stepping && line ? line.fens[idx]! : ex.fen;

  return (
    <figure className="rounded-lg border border-neutral-200 p-3">
      <div className="mx-auto max-w-[260px]">
        <ChessBoard
          fen={boardFen}
          orientation={ex.userColor}
          playedUci={atFocus ? ex.playedMoveUci : undefined}
          betterUci={atFocus ? ex.betterMove : undefined}
        />
      </div>

      {stepping && line ? (
        <div className="mt-2 flex items-center justify-center gap-3 text-sm">
          <button
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            className="rounded border border-neutral-300 px-2 py-0.5 disabled:opacity-40"
            aria-label="Previous move"
          >
            ◀
          </button>
          <span className="text-neutral-600">
            {idx < line.sans.length ? `${line.sans[idx]}` : 'result'}
            {idx === line.focusIndex ? ' ← the mistake' : ''}
          </span>
          <button
            onClick={() => setIdx((i) => Math.min(line.fens.length - 1, i + 1))}
            disabled={idx === line.fens.length - 1}
            className="rounded border border-neutral-300 px-2 py-0.5 disabled:opacity-40"
            aria-label="Next move"
          >
            ▶
          </button>
        </div>
      ) : null}

      <figcaption className="mt-2 text-sm text-neutral-600">
        <span className="flex flex-wrap items-center gap-2">
          <span>
            Move {ex.moveNumber}: you played <strong>{ex.playedMove}</strong>
            {ex.betterMoveSan ? (
              <>
                {' '}
                — better was <strong className="text-green-700">{ex.betterMoveSan}</strong>
              </>
            ) : null}
          </span>
          {alreadyLost(ex.cpBefore) && (
            <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs text-neutral-600">
              already losing
            </span>
          )}
        </span>
        <span className="mt-1 block text-neutral-700">{ex.note}</span>
        <span className="mt-1 flex gap-3 text-xs">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> your move
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-green-600" /> better
          </span>
        </span>
        <span className="mt-1 flex gap-3">
          {line && (
            <button
              onClick={() => {
                setStepping((s) => !s);
                setIdx(line.focusIndex);
              }}
              className="text-brand underline"
            >
              {stepping ? 'Hide moves' : 'Step through'}
            </button>
          )}
          {ex.gameUrl && (
            <a href={ex.gameUrl} target="_blank" rel="noopener noreferrer" className="text-brand underline">
              View on Lichess
            </a>
          )}
        </span>
      </figcaption>
    </figure>
  );
}
