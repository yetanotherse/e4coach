'use client';

import { useEffect, useRef } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Key } from 'chessground/types';

/**
 * Read-only board snippet rendered with Chessground (spec §6). Shows the
 * position before the mistake; optionally highlights the recommended move.
 */
export function ChessBoard({
  fen,
  orientation = 'white',
  bestMove,
}: {
  fen: string;
  orientation?: 'white' | 'black';
  bestMove?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const boardFen = fen.split(' ')[0];
    const lastMove =
      bestMove && bestMove.length >= 4
        ? ([bestMove.slice(0, 2), bestMove.slice(2, 4)] as Key[])
        : undefined;
    apiRef.current = Chessground(ref.current, {
      fen: boardFen,
      orientation,
      viewOnly: true,
      coordinates: true,
      drawable: { enabled: false },
      ...(lastMove ? { lastMove } : {}),
    });
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
  }, [fen, orientation, bestMove]);

  return <div ref={ref} className="aspect-square w-full" />;
}
