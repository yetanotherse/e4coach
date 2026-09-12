/**
 * Puzzle-drill explanation facts (drill-insight feature). A puzzle has no
 * played move from the solver — the story is the opponent's setup move that
 * created the position and the solution that punishes it. Everything is built
 * into the SAME `ExplanationFacts` shape as game mistakes so the prompt, the
 * grounding validation, the LLM narration, and the UI all work unchanged;
 * only the framing differs (see the puzzle prompt in prompts/explain.ts).
 */
import { Chess, type Square } from 'chess.js';
import type { Color } from '../types.js';
import type { ExplanationFacts, Motif, Variation } from './explain.js';
import {
  classifyBestMove,
  forkTargets,
  lineMotifs,
  materialBalance,
  replayUci,
  takeaway,
  whyBetter,
  PIECE_NAMES,
  PIECE_VALUES,
} from './explain.js';

export interface PuzzleExplainInput {
  /** join key for the LLM batch, e.g. `puzzle:<externalId>` */
  id: string;
  /** the position the solver faces — already AFTER the opponent's setup move */
  fen: string;
  /** the solver's color (== the drill's sideToMove) */
  solverColor: Color;
  /** the opponent's move that produced `fen` (UCI + SAN) */
  setupUci: string;
  setupSan: string;
  /** the solver's solution line (UCI, space-separated, alternating with replies) */
  solutionLine: string;
  /** user-POV eval of `fen` before the solution move (engine, side-to-move POV) */
  cpBefore?: number;
  mateBefore?: number;
  /** user-POV eval at the END of the solution line (engine) */
  cpAfter?: number;
  mateAfter?: number;
  /** engine alternatives from MultiPV (each a UCI line starting from `fen`) */
  alternativePvs?: string[][];
  /** plies of each variation we keep */
  maxPlies?: number;
}

const DEFAULT_MAX_PLIES = 6;

/**
 * Derive the teachable facts behind one solved puzzle. Never throws: a line
 * that does not replay simply yields fewer facts, and the caller falls back
 * gracefully (no explanation persisted).
 */
export function derivePuzzleExplanationFacts(input: PuzzleExplainInput): ExplanationFacts | null {
  const maxPlies = input.maxPlies ?? DEFAULT_MAX_PLIES;
  const us: 'w' | 'b' = input.solverColor === 'white' ? 'w' : 'b';

  // The official solution line — what the solver actually played — becomes the
  // 'best' variation. Engine PV is deliberately NOT substituted: the drill's
  // accepted answer is the puzzle line, and the board must show that same line.
  const solution = replayUci(input.fen, input.solutionLine.split(/\s+/).filter(Boolean), maxPlies);
  if (solution.sans.length === 0) return null;

  const variations: Variation[] = [
    {
      kind: 'best',
      label: `Solution: ${solution.sans[0]}`,
      startFen: input.fen,
      sans: solution.sans,
      ...(input.mateAfter !== undefined
        ? { mate: input.mateAfter }
        : input.cpAfter !== undefined
          ? { cp: input.cpAfter }
          : {}),
    },
  ];

  // What the solution's first move does: captures, checks, tactics. This is
  // the solver punishing the opponent's setup move, so motif detection runs
  // from the SOLVER's color.
  let hangs: ExplanationFacts['hangs'];
  const motifs = new Set<Motif>();
  const firstUci = input.solutionLine.split(/\s+/)[0];
  if (firstUci && firstUci.length >= 4) {
    try {
      const chess = new Chess(input.fen);
      const move = chess.move({
        from: firstUci.slice(0, 2),
        to: firstUci.slice(2, 4),
        ...(firstUci.length > 4 ? { promotion: firstUci.slice(4, 5) } : {}),
      });
      if (move.captured) {
        motifs.add('capture');
        hangs = {
          square: move.to,
          piece: PIECE_NAMES[move.captured] ?? move.captured,
          valuePawns: PIECE_VALUES[move.captured] ?? 0,
        };
      }
      if (move.promotion) motifs.add('promotion');
      if (chess.isCheckmate()) motifs.add('mate');
      else if (chess.isCheck()) motifs.add('check');
      if (forkTargets(chess, move.to as Square, us) >= 2) motifs.add('fork');
      for (const m of lineMotifs(chess, move.to as Square, us)) motifs.add(m);
    } catch {
      // Solution move did not apply — leave motifs empty rather than guess.
    }
  }

  // Engine alternatives (MultiPV ranks 2..N from the puzzle position): lines
  // the engine says also work. The solution move itself is excluded so the
  // 'best' tab always shows the official answer.
  for (const pv of input.alternativePvs ?? []) {
    const alt = replayUci(input.fen, pv, maxPlies);
    const first = alt.sans[0];
    if (!first || first === solution.sans[0]) continue;
    variations.push({
      kind: 'alternative',
      label: `Also good: ${first}`,
      startFen: input.fen,
      sans: alt.sans,
    });
  }

  const firstSan = solution.sans[0];
  let bestSan: string | undefined;
  try {
    const chess = new Chess(input.fen);
    bestSan = chess.move({
      from: firstUci!.slice(0, 2),
      to: firstUci!.slice(2, 4),
      ...(firstUci!.length > 4 ? { promotion: firstUci!.slice(4, 5) } : {}),
    })?.san;
  } catch {
    bestSan = firstSan;
  }

  return {
    id: input.id,
    fenBefore: input.fen,
    userColor: input.solverColor,
    // Framing: the "played" move is the OPPONENT'S setup move — see the puzzle
    // prompt. The solver is the reader.
    playedSan: input.setupSan,
    ...(bestSan ? { bestSan } : {}),
    variations,
    ...(hangs ? { hangs } : {}),
    refutationMotifs: [...motifs],
    bestMoveRole: classifyBestMove(input.fen, bestSan, hangs, us),
    materialSwingPawns:
      materialBalance(solution.endFen, input.solverColor) -
      materialBalance(input.fen, input.solverColor),
    allowedMoves: [...new Set([input.setupSan, ...variations.flatMap((v) => v.sans)])],
  };
}

/**
 * Deterministic coach prose for a solved puzzle — the fallback whenever the
 * LLM is unavailable or its output is rejected. Addressed to the solver.
 */
export function renderPuzzleExplanation(f: ExplanationFacts): {
  whatWentWrong: string;
  whyBetter: string;
  takeaway: string;
} {
  const solution = f.variations.find((v) => v.kind === 'best');
  const motifs = new Set(f.refutationMotifs);

  let whatWentWrong: string;
  if (motifs.has('mate')) {
    whatWentWrong = `Your opponent's ${f.playedSan} walked into mate — ${f.bestSan} ends the game.`;
  } else if (f.hangs) {
    whatWentWrong = `Your opponent's ${f.playedSan} left the ${f.hangs.piece} on ${f.hangs.square} capturable.`;
  } else {
    whatWentWrong = `Your opponent's ${f.playedSan} allowed a strong reply: ${solution?.sans[0] ?? f.bestSan}.`;
  }
  if (motifs.has('fork')) {
    whatWentWrong += ' The move attacks two things at once, so the opponent cannot save both.';
  } else if (motifs.has('pin')) {
    whatWentWrong += ' The piece behind is pinned and cannot move out of the way.';
  } else if (motifs.has('skewer')) {
    whatWentWrong += ' It skewers two pieces, so moving the front one drops the one behind.';
  }

  const alternatives = f.variations.filter((v) => v.kind === 'alternative');
  const also =
    alternatives.length > 0
      ? ` ${alternatives.map((a) => a.sans[0]).join(' and ')} also worked.`
      : '';

  return {
    whatWentWrong,
    whyBetter: `${whyBetter(f)}${also}`,
    takeaway: takeaway(f, motifs),
  };
}
