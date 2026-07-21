'use client';

import { useState } from 'react';
import { ChessBoard } from './ChessBoard';
import { GameViewer } from './GameViewer';
import { VariationTabs, type VariationData } from './VariationTabs';

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
  /** coaching prose from the deep analysis pass; absent on older reports */
  explanation?: {
    whatWentWrong: string;
    whyBetter: string;
    takeaway: string;
    source: 'llm' | 'template';
  };
  /** engine lines the reader can step through; absent on older reports */
  variations?: VariationData[];
}

/** Was the position already lost before the move? (spec feedback #4) */
function alreadyLost(cpBefore: number): boolean {
  return cpBefore <= -300;
}

/** Optional full game for the in-app stepper (study imports). */
export interface FullGame {
  pgn: string;
  userColor: 'white' | 'black';
  event?: string;
  speed?: string; // time-control bucket, shown as a badge
  timeControl?: string; // raw time control, tooltip on the badge
}

export function MoveExample({ ex, fullGame }: { ex: ExampleData; fullGame?: FullGame }) {
  const [stepping, setStepping] = useState(false);
  const [idx, setIdx] = useState(ex.line?.focusIndex ?? 0);

  const line = ex.line;
  const atFocus = !stepping || !line || idx === line.focusIndex;
  const boardFen = stepping && line ? line.fens[idx]! : ex.fen;

  const showFullGame = Boolean(fullGame) && stepping;
  // Engine lines take over the board when we have them — they answer "why was
  // this a mistake?" far better than a single static position with two arrows.
  const showVariations = !showFullGame && Boolean(ex.variations?.length) && !stepping;

  return (
    <figure className="rounded-lg border border-neutral-200 p-3">
      {showFullGame && fullGame ? (
        <GameViewer
          pgn={fullGame.pgn}
          userColor={fullGame.userColor}
          focusPly={ex.ply}
          playedUci={ex.playedMoveUci}
          betterUci={ex.betterMove}
        />
      ) : showVariations ? (
        <VariationTabs variations={ex.variations!} orientation={ex.userColor} />
      ) : (
        <div className="mx-auto max-w-[260px]">
          <ChessBoard
            fen={boardFen}
            orientation={ex.userColor}
            playedUci={atFocus ? ex.playedMoveUci : undefined}
            betterUci={atFocus ? ex.betterMove : undefined}
          />
        </div>
      )}

      {stepping && line && !fullGame ? (
        <div className="mt-2 flex items-center justify-center gap-3 text-sm print:hidden">
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
        {(fullGame?.event || fullGame?.speed) && (
          <span className="mb-1 flex items-center gap-2">
            {fullGame.event && (
              <span className="text-xs font-medium text-neutral-500">{fullGame.event}</span>
            )}
            {fullGame.speed && (
              <span
                title={fullGame.timeControl}
                className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand-dark"
              >
                {fullGame.speed}
              </span>
            )}
          </span>
        )}
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
        {ex.explanation ? (
          <span className="mt-2 block space-y-1.5 text-neutral-700">
            <span className="block">{ex.explanation.whatWentWrong}</span>
            {ex.explanation.whyBetter && (
              <span className="block">{ex.explanation.whyBetter}</span>
            )}
            <span className="block text-neutral-600">
              <strong className="font-medium">Takeaway:</strong> {ex.explanation.takeaway}
            </span>
          </span>
        ) : (
          // Reports generated before the deep analysis pass only have `note`.
          <span className="mt-1 block text-neutral-700">{ex.note}</span>
        )}
        <span className="mt-1 flex gap-3 text-xs">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> your move
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-green-600" /> better
          </span>
        </span>
        <span className="mt-1 flex gap-3">
          {(fullGame || line) && (
            <button
              onClick={() => {
                setStepping((s) => !s);
                if (line) setIdx(line.focusIndex);
              }}
              className="text-brand underline print:hidden"
            >
              {stepping
                ? fullGame
                  ? 'Hide game'
                  : 'Hide moves'
                : fullGame
                  ? 'Replay full game'
                  : 'Step through'}
            </button>
          )}
          {ex.gameUrl && !fullGame && (
            <a
              href={ex.gameUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline"
            >
              View on Lichess
            </a>
          )}
        </span>
      </figcaption>
    </figure>
  );
}
