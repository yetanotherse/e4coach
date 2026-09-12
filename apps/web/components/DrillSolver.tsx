'use client';

import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { DrillBoard } from './DrillBoard';

export interface DrillData {
  id: string;
  type: 'own_game' | 'puzzle';
  theme: string;
  themeName: string;
  fen: string;
  sideToMove: 'white' | 'black';
  solutionUci: string;
  solutionSan?: string | null;
  playedMoveSan?: string | null;
  gameId?: string | null;
  note?: string | null;
}

type Phase = 'solving' | 'wrong' | 'solved';

/**
 * Solve flow: make the move you should have played. Wrong tries snap back and
 * are recorded (solved:false); the correct move records solved:true and shows
 * the grounded explanation from the report. The user's original mistake is
 * only revealed after solving. `backHref` sends the user back to where they
 * came from (the plan, or the review queue).
 */
export function DrillSolver({
  drill,
  backHref = '/plan',
}: {
  drill: DrillData;
  backHref?: string;
}) {
  const [phase, setPhase] = useState<Phase>('solving');
  const [tries, setTries] = useState(0);
  const [hinted, setHinted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resets, setResets] = useState(0);
  const [flashUci, setFlashUci] = useState<string | undefined>(undefined);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(Date.now());

  // Reset per drill in case the component is reused.
  useEffect(() => {
    setPhase('solving');
    setTries(0);
    setHinted(false);
    setResets(0);
    setFlashUci(undefined);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    startedAt.current = Date.now();
  }, [drill.id]);

  async function record(solved: boolean, playedUci?: string) {
    setSaving(true);
    try {
      const timeSpentMs = Date.now() - startedAt.current;
      await fetch(`/api/drills/${drill.id}/attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solved,
          ...(playedUci ? { playedUci } : {}),
          ...(solved ? { timeSpentMs } : {}),
        }),
      });
    } catch {
      /* attempt recording is best-effort */
    } finally {
      setSaving(false);
    }
  }

  function onMove(from: string, to: string) {
    if (phase === 'solved') return;
    const probe = new Chess(drill.fen);
    let move = probe.move({ from, to, promotion: 'q' });
    if (!move) move = probe.move({ from, to });
    if (!move) return; // chessground already restricts to legal dests

    const playedUci = move.lan;
    if (playedUci === drill.solutionUci) {
      setPhase('solved');
      void record(true, playedUci);
      return;
    }
    setPhase('wrong');
    setTries((t) => t + 1);
    setResets((r) => r + 1);
    setFlashUci(playedUci);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashUci(undefined), 800);
    void record(false, playedUci);
  }
  const showHint = hinted || tries >= 3;
  const solved = phase === 'solved';

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <a href={backHref} className="text-sm text-brand hover:underline">
          ← Back
        </a>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
          {drill.themeName}
        </span>
      </div>

      <p className="mb-3 text-sm text-neutral-600">
        {solved
          ? 'Solved — here is the position with the correct move marked.'
          : phase === 'wrong'
            ? 'Not that one. Look again — what does your opponent threaten?'
            : `You are ${drill.sideToMove}. Find the better move.`}
      </p>

      <DrillBoard
        fen={drill.fen}
        orientation={drill.sideToMove}
        solutionUci={solved || showHint ? drill.solutionUci : undefined}
        flashUci={flashUci}
        resetSignal={resets}
        onMove={onMove}
      />

      {drill.type === 'puzzle' && (
        <p className="mt-2 text-center text-xs text-neutral-400">
          Position from the Lichess community puzzle database (CC BY-SA).
        </p>
      )}

      {phase === 'wrong' && (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          That wasn&apos;t the move. Try again — or take the hint above.
        </p>
      )}

      {!solved && showHint && drill.solutionSan && (
        <p className="mt-3 rounded-lg bg-brand/10 px-4 py-3 text-sm text-brand-dark">
          Hint: {drill.solutionSan} is the move the engine preferred.
        </p>
      )}

      {solved && (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm">
            {drill.solutionSan && (
              <p className="font-medium text-neutral-900">
                Correct: {drill.solutionSan}
                {drill.playedMoveSan && (
                  <span className="text-neutral-500"> (you had played {drill.playedMoveSan})</span>
                )}
              </p>
            )}
            {drill.note && <p className="mt-2 text-neutral-600">{drill.note}</p>}
          </div>
          <button
            onClick={() => (window.location.href = backHref)}
            disabled={saving}
            className="w-full rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Done'}
          </button>
        </div>
      )}

      {!solved && (
        <p className="mt-3 text-center text-xs text-neutral-400">
          Hint appears after a few tries, or{' '}
          <button onClick={() => setHinted(true)} className="underline">
            ask for it now
          </button>
          .
        </p>
      )}
    </div>
  );
}
