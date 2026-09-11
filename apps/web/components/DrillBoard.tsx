'use client';

import { useEffect, useRef } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Key } from 'chessground/types';
import type { DrawShape } from 'chessground/draw';
import { Chess } from 'chess.js';

const BRUSHES = {
  green: { key: 'g', color: '#16A34A', opacity: 0.9, lineWidth: 10 },
  red: { key: 'r', color: '#DC2626', opacity: 0.9, lineWidth: 10 },
  blue: { key: 'b', color: '#2563EB', opacity: 0.9, lineWidth: 10 },
  yellow: { key: 'y', color: '#D97706', opacity: 0.9, lineWidth: 10 },
};

/** Legal-move map for chessground's free:false movable config. */
function destsFor(fen: string): Map<Key, Key[]> {
  const chess = new Chess(fen);
  const dests = new Map<Key, Key[]>();
  for (const m of chess.moves({ verbose: true })) {
    const from = m.from as Key;
    dests.set(from, [...(dests.get(from) ?? []), m.to as Key]);
  }
  return dests;
}

/**
 * Interactive drill board: the user plays the side they had in the game.
 * Emits (from, to) pairs; position/feedback state stays in the solver so the
 * board can be reset cleanly after a wrong try.
 */
export function DrillBoard({
  fen,
  orientation,
  solutionUci,
  onMove,
}: {
  fen: string;
  orientation: 'white' | 'black';
  /** shown as a green arrow once solved / hinted */
  solutionUci?: string;
  onMove: (from: string, to: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    if (!ref.current) return;
    apiRef.current = Chessground(ref.current, {
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
    api.set({
      fen: fen.split(' ')[0],
      orientation,
      turnColor: orientation,
      movable: {
        free: false,
        color: orientation,
        showDests: true,
        dests: destsFor(fen),
        events: {
          after: (orig: Key, dest: Key) => onMoveRef.current(orig, dest),
        },
      },
    });
    const shapes: DrawShape[] = [];
    if (solutionUci && solutionUci.length >= 4) {
      shapes.push({ orig: solutionUci.slice(0, 2) as Key, dest: solutionUci.slice(2, 4) as Key, brush: 'green' });
    }
    api.setAutoShapes(shapes);
  }, [fen, orientation, solutionUci]);

  return <div ref={ref} className="aspect-square w-full" />;
}
