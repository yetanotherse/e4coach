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

/** Color whose king is in check on `fen` (the side to move), or false. */
function checkColorOf(fen: string): 'white' | 'black' | false {
  const chess = new Chess(fen);
  return chess.inCheck() ? (chess.turn() === 'w' ? 'white' : 'black') : false;
}

/**
 * Interactive drill board: the user plays the side they had in the game.
 * Emits (from, to) pairs; position/feedback state stays in the solver so the
 * board can be reset cleanly after a wrong try.
 */
export function DrillBoard({
  fen,
  orientation,
  solutionUcis,
  lastMoveUci,
  flashUci,
  locked,
  resetSignal,
  onMove,
}: {
  fen: string;
  orientation: 'white' | 'black';
  /** shown as green arrow(s) once solved / hinted */
  solutionUcis?: string[];
  /** most recent move (UCI), shown as the standard yellow last-move highlight */
  lastMoveUci?: string | null;
  /** wrong move, briefly shown as a red arrow while the piece snaps back */
  flashUci?: string;
  /** true while the opponent's reply is animating or the drill is solved */
  locked?: boolean;
  /** bump to snap the board back to `fen` after a wrong try */
  resetSignal?: number;
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
      // Red glow on the checked king (styled in globals.css), like Lichess.
      // Explicit color: chessground's `check: true` highlights the king of
      // turnColor (pinned to the solver here), not whoever is actually in
      // check — e.g. after the solver's mating move, the mated opponent.
      check: checkColorOf(fen),
      // Standard yellow last-move highlight (Lichess-style context marker).
      lastMove:
        lastMoveUci && lastMoveUci.length >= 4
          ? [lastMoveUci.slice(0, 2) as Key, lastMoveUci.slice(2, 4) as Key]
          : [],
      movable: {
        free: false,
        // Locked: no side may move (opponent reply pending, or solved).
        ...(locked ? { color: undefined } : { color: orientation }),
        showDests: !locked,
        dests: destsFor(fen),
        events: {
          after: (orig: Key, dest: Key) => onMoveRef.current(orig, dest),
        },
      },
    });
    const shapes: DrawShape[] = [];
    if (flashUci && flashUci.length >= 4) {
      shapes.push({ orig: flashUci.slice(0, 2) as Key, dest: flashUci.slice(2, 4) as Key, brush: 'red' });
    } else {
      for (const uci of solutionUcis ?? []) {
        if (uci.length >= 4) {
          shapes.push({ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush: 'green' });
        }
      }
    }
    api.setAutoShapes(shapes);
  }, [fen, orientation, solutionUcis, lastMoveUci, flashUci, locked, resetSignal]);

  return <div ref={ref} className="aspect-square w-full" />;
}
