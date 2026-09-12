'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { assessEval } from '@chess-coach/core';
import { DrillBoard } from './DrillBoard';
import { VariationTabs, type VariationData } from './VariationTabs';

/** A single wrong move explanation, same shape as the report's prose. */
export interface DrillExplanation {
  whatWentWrong: string;
  whyBetter: string;
  takeaway: string;
  source: 'llm' | 'template';
}

export interface DrillData {
  id: string;
  type: 'own_game' | 'puzzle';
  theme: string;
  themeName: string;
  fen: string;
  sideToMove: 'white' | 'black';
  solutionUci: string;
  /**
   * The opponent's setup move (UCI) that produced `fen` — puzzle drills only,
   * derived from the source Puzzle row. Highlighted at drill start for
   * context, Lichess-style.
   */
  setupMoveUci?: string | null;
  /**
   * Full multi-move solution line (UCI, space-separated): the solver's moves
   * alternating with the opponent's replies. Own-game drills are single-move
   * and leave this unset.
   */
  solutionLine?: string | null;
  solutionSan?: string | null;
  playedMoveSan?: string | null;
  gameId?: string | null;
  note?: string | null;
  /**
   * Post-solve insight (persisted at analysis/plan time): coach prose, engine
   * variations, and the eval swing around the solution. Absent on older
   * drills — the panel then keeps showing `note` only.
   */
  explanation?: DrillExplanation;
  variations?: VariationData[];
  cpBefore?: number | null;
  cpAfter?: number | null;
}

type Phase = 'solving' | 'wrong' | 'solved';

const OPPONENT_REPLY_DELAY_MS = 500;

/**
 * Solve flow: make the move you should have played. For puzzle drills the
 * solution is a full line: each correct move is answered by the opponent's
 * programmed reply and the user keeps playing until the line ends. Wrong
 * tries snap back and are recorded (solved:false); completing the line
 * records solved:true. The user's original mistake is only revealed after
 * solving. `backHref` sends the user back to where they came from (the plan,
 * or the review queue).
 */
export function DrillSolver({
  drill,
  backHref = '/plan',
}: {
  drill: DrillData;
  backHref?: string;
}) {
  // The move sequence the user must play: the full line for puzzles, the
  // single better move for own-game drills (and legacy puzzle rows).
  const line = useMemo(() => {
    const moves = drill.solutionLine?.trim().split(/\s+/).filter(Boolean) ?? [];
    return moves.length > 0 ? moves : [drill.solutionUci];
  }, [drill.id, drill.solutionLine, drill.solutionUci]);

  // SAN for each line move, walked once from the start position.
  const lineSan = useMemo(() => {
    const san: string[] = [];
    try {
      const chess = new Chess(drill.fen);
      for (const uci of line) {
        const move = applyUci(chess, uci);
        if (!move) break;
        san.push(move.san);
      }
    } catch {
      /* display-only: fall back to whatever was collected */
    }
    return san;
  }, [drill.id, drill.fen, line]);

  const [phase, setPhase] = useState<Phase>('solving');
  const [fen, setFen] = useState(drill.fen);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false); // opponent reply pending
  // Most recent move on the board (Lichess last-move highlight): the
  // opponent's setup move at start, then alternates user move / reply.
  const [lastMoveUci, setLastMoveUci] = useState<string | undefined>(
    drill.setupMoveUci ?? undefined,
  );
  const [tries, setTries] = useState(0);
  const [hinted, setHinted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resets, setResets] = useState(0);
  const [flashUci, setFlashUci] = useState<string | undefined>(undefined);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(Date.now());

  // Reset per drill in case the component is reused.
  useEffect(() => {
    setPhase('solving');
    setFen(drill.fen);
    setStep(0);
    setBusy(false);
    setLastMoveUci(drill.setupMoveUci ?? undefined);
    setTries(0);
    setHinted(false);
    setResets(0);
    setFlashUci(undefined);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    if (replyTimer.current) clearTimeout(replyTimer.current);
    startedAt.current = Date.now();
  }, [drill.id, drill.fen]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (replyTimer.current) clearTimeout(replyTimer.current);
    },
    [],
  );

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

  /** A played move matches the expected UCI (promotion piece lenient). */
  function matches(expected: string, played: string): boolean {
    return expected.length >= 5 ? played === expected : played.slice(0, 4) === expected.slice(0, 4);
  }

  /** Apply a UCI move to a position; null when illegal (chess.js throws). */
  function applyUci(chess: Chess, uci: string) {
    try {
      return chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci.length >= 5 ? { promotion: uci[4] } : {}),
      });
    } catch {
      return null;
    }
  }

  function onMove(from: string, to: string) {
    if (phase === 'solved' || busy || step >= line.length) return;
    const probe = new Chess(fen);
    let move: ReturnType<Chess['move']>;
    try {
      move = probe.move({ from, to, promotion: 'q' });
      if (!move) move = probe.move({ from, to });
    } catch {
      return; // chessground already restricts to legal dests
    }
    if (!move) return;

    const playedUci = move.lan;
    if (!matches(line[step]!, playedUci)) {
      // First wrong move anywhere in the line fails the attempt.
      setPhase('wrong');
      setTries((t) => t + 1);
      setResets((r) => r + 1);
      setFlashUci(playedUci);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashUci(undefined), 800);
      void record(false, playedUci);
      return;
    }

    const afterUserFen = probe.fen();
    setLastMoveUci(playedUci);
    if (step === line.length - 1) {
      // Final move of the line — puzzle complete.
      setFen(afterUserFen);
      setPhase('solved');
      void record(true, playedUci);
      return;
    }

    // Advance, then play the opponent's programmed reply after a beat.
    setFen(afterUserFen);
    setStep(step + 1);
    setBusy(true);
    const opponentUci = line[step + 1]!;
    replyTimer.current = setTimeout(() => {
      const reply = new Chess(afterUserFen);
      const opponentMove = applyUci(reply, opponentUci);
      const next = step + 2;
      if (opponentMove) {
        setFen(reply.fen());
        setLastMoveUci(opponentUci);
      }
      setBusy(false);
      if (next >= line.length) {
        // The line ends with the opponent's reply (e.g. defensive puzzles).
        setPhase('solved');
        void record(true, playedUci);
      } else {
        setStep(next);
      }
    }, OPPONENT_REPLY_DELAY_MS);
  }

  const showHint = hinted || tries >= 3;
  const solved = phase === 'solved';
  // Eval swing around the solution, in the same plain language the report uses
  // (drill-insight feature). Only shown when both sides of the swing are known.
  const swing =
    typeof drill.cpBefore === 'number' && typeof drill.cpAfter === 'number'
      ? { from: assessEval(drill.cpBefore), to: assessEval(drill.cpAfter) }
      : null;
  // Hint (and the solved board) highlight the move to find. After solving,
  // highlight the final solver move of the line (the last even index).
  const lastUserIndex = line.length % 2 === 0 ? line.length - 2 : line.length - 1;
  const hintUcis = solved
    ? [line[Math.max(lastUserIndex, 0)]!]
    : showHint && !busy && step < line.length
      ? [line[step]!]
      : undefined;

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
          ? 'Solved — here is the final position with the full line marked.'
          : busy
            ? '…'
            : phase === 'wrong'
              ? 'Not that one. Look again — what does your opponent threaten?'
              : `You are ${drill.sideToMove}. Find the better move.`}
      </p>

      <DrillBoard
        fen={fen}
        orientation={drill.sideToMove}
        solutionUcis={hintUcis}
        lastMoveUci={lastMoveUci}
        flashUci={flashUci}
        locked={busy || solved}
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

      {!solved && showHint && lineSan[step] && (
        <p className="mt-3 rounded-lg bg-brand/10 px-4 py-3 text-sm text-brand-dark">
          Hint: {lineSan[step]} is the move the engine preferred.
        </p>
      )}

      {solved && (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm">
            {lineSan.length > 0 && (
              <p className="font-medium text-neutral-900">
                {lineSan.length === 1 ? 'Correct: ' : 'Solution: '}
                {lineSan.join(' ')}
                {drill.playedMoveSan && (
                  <span className="text-neutral-500"> (you had played {drill.playedMoveSan})</span>
                )}
              </p>
            )}
            {swing && (
              <p className="mt-2 text-neutral-600">
                Evaluation: <span className="text-neutral-700">{swing.from}</span> →{' '}
                <span className="font-medium text-neutral-900">{swing.to}</span>
              </p>
            )}
            {drill.note && <p className="mt-2 text-neutral-600">{drill.note}</p>}
          </div>
          {drill.explanation && (
            <div className="rounded-lg border border-brand/30 bg-white px-4 py-3 text-sm">
              <p className="text-neutral-700">{drill.explanation.whatWentWrong}</p>
              {drill.explanation.whyBetter && (
                <p className="mt-1.5 text-neutral-700">{drill.explanation.whyBetter}</p>
              )}
              <p className="mt-1.5 text-neutral-600">
                <strong className="font-medium">Takeaway:</strong> {drill.explanation.takeaway}
              </p>
            </div>
          )}
          {drill.variations && drill.variations.length > 0 && (
            <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
              <VariationTabs variations={drill.variations} orientation={drill.sideToMove} />
            </div>
          )}
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
