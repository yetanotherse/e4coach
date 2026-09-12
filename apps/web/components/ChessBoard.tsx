'use client';

import { useEffect, useRef } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Key } from 'chessground/types';
import type { DrawShape } from 'chessground/draw';
import { Chess } from 'chess.js';

/** On-brand arrows: better move = success green, played move = danger red. */
const BRUSHES = {
  green: { key: 'g', color: '#16A34A', opacity: 0.9, lineWidth: 10 },
  red: { key: 'r', color: '#DC2626', opacity: 0.9, lineWidth: 10 },
  blue: { key: 'b', color: '#2563EB', opacity: 0.9, lineWidth: 10 },
  yellow: { key: 'y', color: '#D97706', opacity: 0.9, lineWidth: 10 },
};

function arrow(uci: string | undefined, brush: 'red' | 'green'): DrawShape[] {
  if (!uci || uci.length < 4) return [];
  return [{ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush }];
}

/** Color whose king is in check on `fen` (the side to move), or false. */
function checkColorOf(fen: string): 'white' | 'black' | false {
  const chess = new Chess(fen);
  return chess.inCheck() ? (chess.turn() === 'w' ? 'white' : 'black') : false;
}

/**
 * Read-only board (spec §6), oriented to the user's side. Optionally draws the
 * played move (red) and the engine's better move (green) as arrows so the
 * mistake reads correctly regardless of which color the user had (feedback #3).
 *
 * The board instance is created ONCE and updated in place. Tearing it down on
 * every prop change (as this used to) destroys chessground's move animation and
 * is visibly janky when stepping through a variation one ply at a time.
 */
export function ChessBoard({
  fen,
  orientation = 'white',
  playedUci,
  betterUci,
}: {
  fen: string;
  orientation?: 'white' | 'black';
  playedUci?: string;
  betterUci?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);

  // Mount once. Config that changes is applied by the effect below.
  useEffect(() => {
    if (!ref.current) return;
    apiRef.current = Chessground(ref.current, {
      viewOnly: true,
      coordinates: true,
      drawable: { enabled: false, brushes: BRUSHES },
    });
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    // Orientation must be set explicitly here — without it, a board for a black
    // player would silently keep the mount-time default and render flipped.
    // check: red glow on the checked king (styled in globals.css), passed as
    // an explicit color — `check: true` would trust turnColor instead of who
    // is actually in check.
    api.set({
      fen: fen.split(' ')[0],
      orientation,
      check: checkColorOf(fen),
    });
    api.setAutoShapes([...arrow(playedUci, 'red'), ...arrow(betterUci, 'green')]);
  }, [fen, orientation, playedUci, betterUci]);

  return <div ref={ref} className="aspect-square w-full" />;
}
