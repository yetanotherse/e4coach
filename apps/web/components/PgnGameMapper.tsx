'use client';

import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { ChessBoard } from './ChessBoard';

/** Preview game shape returned by /api/import/pgn/parse (mirrors UploadedGamePreview). */
export interface PgnPreviewGame {
  id: string;
  pgn: string;
  white: string;
  black: string;
  event?: string;
  result: string;
  timeControl: string;
  speedGuess?: string;
  playedAt: string;
  plyCount: number;
}

/** The user's choices for one game. */
export interface GameMapping {
  userColor?: 'white' | 'black';
  speed?: string;
}

const SPEED_OPTIONS = ['ultrabullet', 'bullet', 'blitz', 'rapid', 'classical'] as const;
const btn = 'rounded border border-neutral-300 px-2 py-0.5 disabled:opacity-40';

interface PgnGameMapperProps {
  game: PgnPreviewGame;
  index: number;
  mapping: GameMapping;
  onChange: (next: GameMapping) => void;
}

/**
 * One card in the mapping step: a board + full move stepper so the user can
 * recall the game, plus the mandatory orientation and optional time-control
 * selectors. The board orients to the chosen side for immediate feedback.
 */
export function PgnGameMapper({ game, index, mapping, onChange }: PgnGameMapperProps) {
  const { fens, sans } = useMemo(() => buildPositions(game.pgn), [game.pgn]);
  const lastIndex = Math.max(0, fens.length - 1);
  const [idx, setIdx] = useState(0);

  const orientation = mapping.userColor ?? 'white';
  const moveLabel =
    idx === 0
      ? 'Start'
      : `${Math.ceil(idx / 2)}${idx % 2 === 1 ? '.' : '...'} ${sans[idx - 1] ?? ''}`;
  const selectId = `game-${game.id}`;
  const played = playedDate(game.playedAt);
  const snippet = openingSnippet(sans);

  return (
    <figure className="rounded-lg border border-neutral-200 p-3">
      <figcaption className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-medium text-neutral-800">Game {index + 1}</span>
        {game.event && <span className="text-neutral-500">· {game.event}</span>}
      </figcaption>
      {snippet && (
        <p className="mb-2 truncate font-mono text-xs text-neutral-500" title={snippet}>
          {snippet}
        </p>
      )}

      <div className="mx-auto max-w-[260px]">
        <ChessBoard fen={fens[idx]!} orientation={orientation} />
      </div>

      <div className="mt-2 flex items-center justify-center gap-2 text-sm">
        <button type="button" onClick={() => setIdx(0)} disabled={idx === 0} className={btn}>
          ⏮
        </button>
        <button
          type="button"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
          className={btn}
        >
          ◀
        </button>
        <span className="min-w-[84px] text-center text-neutral-600">{moveLabel}</span>
        <button
          type="button"
          onClick={() => setIdx((i) => Math.min(lastIndex, i + 1))}
          disabled={idx === lastIndex}
          className={btn}
        >
          ▶
        </button>
        <button
          type="button"
          onClick={() => setIdx(lastIndex)}
          disabled={idx === lastIndex}
          className={btn}
        >
          ⏭
        </button>
      </div>

      <dl className="mt-2 space-y-0.5 text-xs text-neutral-600">
        <div className="flex justify-between gap-2">
          <dt className="text-neutral-400">White</dt>
          <dd className="truncate font-medium text-neutral-700">{game.white}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-neutral-400">Black</dt>
          <dd className="truncate font-medium text-neutral-700">{game.black}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-neutral-400">Result</dt>
          <dd className="font-medium text-neutral-700">{game.result}</dd>
        </div>
        {played && (
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-400">Date</dt>
            <dd className="font-medium text-neutral-700">{played}</dd>
          </div>
        )}
      </dl>

      <div className="mt-3 space-y-2">
        <div>
          <label
            htmlFor={`${selectId}-color`}
            className="block text-xs font-medium text-neutral-700"
          >
            You played as <span className="text-red-600">*</span>
          </label>
          <select
            id={`${selectId}-color`}
            value={mapping.userColor ?? ''}
            onChange={(e) =>
              onChange({
                ...mapping,
                userColor: (e.target.value || undefined) as GameMapping['userColor'],
              })
            }
            required
            className={`mt-1 w-full rounded-lg border px-3 py-2 focus:border-brand focus:outline-none ${
              mapping.userColor ? 'border-neutral-300' : 'border-amber-400'
            }`}
          >
            <option value="">Select your side…</option>
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
        </div>
        <div>
          <label
            htmlFor={`${selectId}-speed`}
            className="block text-xs font-medium text-neutral-700"
          >
            Time control <span className="text-neutral-400">(optional)</span>
          </label>
          <select
            id={`${selectId}-speed`}
            value={mapping.speed ?? ''}
            onChange={(e) => onChange({ ...mapping, speed: e.target.value || undefined })}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand focus:outline-none"
          >
            <option value="">Not specified</option>
            {SPEED_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
    </figure>
  );
}

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

/** First few moves formatted "1. e4 c5 2. Nf3 …" — a recall aid when tags are sparse. */
function openingSnippet(sans: string[], maxPlies = 8): string {
  const parts: string[] = [];
  for (let i = 0; i < Math.min(sans.length, maxPlies); i++) {
    if (i % 2 === 0) parts.push(`${i / 2 + 1}.`);
    parts.push(sans[i]!);
  }
  const s = parts.join(' ');
  return sans.length > maxPlies ? `${s} …` : s;
}

/** YYYY-MM-DD for display, or '' if the date is the (unknown) epoch/today default. */
function playedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
