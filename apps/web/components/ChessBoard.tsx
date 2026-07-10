'use client';

import { useEffect, useRef } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Key } from 'chessground/types';
import type { DrawShape } from 'chessground/draw';

/**
 * Read-only board (spec §6), oriented to the user's side. Optionally draws the
 * played move (red) and the engine's better move (green) as arrows so the
 * mistake reads correctly regardless of which color the user had (feedback #3).
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

  useEffect(() => {
    if (!ref.current) return;
    const shapes: DrawShape[] = [];
    if (playedUci && playedUci.length >= 4) {
      shapes.push({ orig: playedUci.slice(0, 2) as Key, dest: playedUci.slice(2, 4) as Key, brush: 'red' });
    }
    if (betterUci && betterUci.length >= 4) {
      shapes.push({ orig: betterUci.slice(0, 2) as Key, dest: betterUci.slice(2, 4) as Key, brush: 'green' });
    }
    apiRef.current = Chessground(ref.current, {
      fen: fen.split(' ')[0],
      orientation,
      viewOnly: true,
      coordinates: true,
      drawable: {
        enabled: false,
        autoShapes: shapes,
        // On-brand arrows: better move = success green, played move = danger red.
        brushes: {
          green: { key: 'g', color: '#16A34A', opacity: 0.9, lineWidth: 10 },
          red: { key: 'r', color: '#DC2626', opacity: 0.9, lineWidth: 10 },
          blue: { key: 'b', color: '#2563EB', opacity: 0.9, lineWidth: 10 },
          yellow: { key: 'y', color: '#D97706', opacity: 0.9, lineWidth: 10 },
        },
      },
    });
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
  }, [fen, orientation, playedUci, betterUci]);

  return <div ref={ref} className="aspect-square w-full" />;
}
