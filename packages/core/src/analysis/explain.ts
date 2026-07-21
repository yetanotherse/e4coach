/**
 * Explanation facts (why a move was a mistake). Pure functions over a position
 * plus two engine variations — no I/O, no engine calls, no LLM.
 *
 * The report used to end every mistake with "The engine preferred Bxb5.", which
 * names a move but never says what it does. This module derives the teachable
 * facts behind that move from lines the engine already gives us:
 *
 *   - the REFUTATION: how the opponent punishes what was actually played
 *     (from evaluating the position AFTER the played move)
 *   - the BEST line: what the engine intended instead
 *   - ALTERNATIVES: other moves that also held (from MultiPV)
 *
 * Everything here is deterministic and derived from the board, so the prose in
 * `renderExplanation` is safe to ship on its own; the LLM layer only rephrases
 * these same facts.
 */
import { Chess, type Square } from 'chess.js';
import type { Color } from '../types.js';

/** Tactical patterns we can recognize deterministically from the board. */
export type Motif = 'capture' | 'check' | 'mate' | 'fork' | 'pin' | 'skewer' | 'promotion';

/** What the engine's preferred move actually accomplishes. */
export type BestMoveRole = 'escape' | 'capture' | 'defend' | 'check' | 'promote' | 'quiet';

/** A line the reader can step through on the board. */
export interface Variation {
  kind: 'refutation' | 'best' | 'alternative';
  /** short human label, e.g. "You played Nf6" / "Better: Bxb5" */
  label: string;
  /** the position the line starts from (always the position before the mistake) */
  startFen: string;
  /** the line in SAN, first move first */
  sans: string[];
  /** evaluation at the end of the line, in centipawns from the USER's POV */
  cp?: number;
  /** mate-in-N from the USER's POV (negative = user gets mated) */
  mate?: number;
}

/** A piece the played move left capturable. */
export interface HangingPiece {
  square: string;
  /** full English name, e.g. "knight" */
  piece: string;
  valuePawns: number;
}

export interface ExplanationFacts {
  /** `${gameId}:${ply}` — the join key for LLM batch responses */
  id: string;
  fenBefore: string;
  userColor: Color;
  playedSan: string;
  bestSan?: string;
  variations: Variation[];
  /** set when the refutation opens by capturing something */
  hangs?: HangingPiece;
  refutationMotifs: Motif[];
  bestMoveRole: BestMoveRole;
  /**
   * Net material change over the refutation line, in pawns, from the USER's
   * POV. Negative means the line costs the user material. This is a plain
   * balance delta, not a static-exchange evaluation — it accounts for
   * recaptures simply by looking at where the line ends up.
   */
  materialSwingPawns: number;
  /**
   * Every SAN the narration layer is permitted to mention. Prose citing a move
   * outside this list is a hallucination and gets rejected.
   */
  allowedMoves: string[];
}

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const PIECE_NAMES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

/** Default plies of a variation we keep — long enough to show the point. */
const DEFAULT_MAX_PLIES = 6;

/** A target worth calling out when counting fork victims. */
const FORK_TARGET_VALUE = 3;

/**
 * Replay a UCI line from a position, converting to SAN.
 *
 * Engine PV tails can be stale or illegal (the search may have been cut
 * mid-iteration), so this TRUNCATES at the first move that does not apply
 * rather than throwing. Callers get whatever prefix was legal.
 */
export function replayUci(
  fen: string,
  uciMoves: string[],
  maxPlies: number = DEFAULT_MAX_PLIES,
): { sans: string[]; endFen: string } {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return { sans: [], endFen: fen };
  }
  const sans: string[] = [];
  for (const uci of uciMoves.slice(0, maxPlies)) {
    if (!uci || uci.length < 4) break;
    try {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci.length > 4 ? { promotion: uci.slice(4, 5) } : {}),
      });
      sans.push(move.san);
    } catch {
      break;
    }
  }
  return { sans, endFen: chess.fen() };
}

/** Material balance in pawns from `color`'s perspective. */
export function materialBalance(fen: string, color: Color): number {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return 0;
  }
  const us = color === 'white' ? 'w' : 'b';
  let balance = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq) continue;
      const value = PIECE_VALUES[sq.type] ?? 0;
      balance += sq.color === us ? value : -value;
    }
  }
  return balance;
}

/**
 * Count enemy pieces the piece on `from` attacks that are worth taking. Two or
 * more (or one plus the king) is a fork.
 */
function forkTargets(chess: Chess, from: Square, byColor: 'w' | 'b'): number {
  let targets = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq || sq.color === byColor) continue;
      const worthwhile = sq.type === 'k' || (PIECE_VALUES[sq.type] ?? 0) >= FORK_TARGET_VALUE;
      if (!worthwhile) continue;
      // attackers() is independent of whose turn it is, so this works without
      // constructing an illegal null-move position.
      if (chess.attackers(sq.square, byColor).includes(from)) targets += 1;
    }
  }
  return targets;
}

const RAYS: Record<string, ReadonlyArray<readonly [number, number]>> = {
  b: [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
  r: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ],
  q: [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ],
};

/**
 * Look for a pin or skewer created by a slider landing on `from`: walk each ray
 * and check whether two enemy pieces line up behind one another.
 */
function lineMotifs(chess: Chess, from: Square, byColor: 'w' | 'b'): Motif[] {
  const piece = chess.get(from);
  if (!piece) return [];
  const rays = RAYS[piece.type];
  if (!rays) return [];

  const file = from.charCodeAt(0) - 97;
  const rank = Number(from[1]) - 1;
  const motifs = new Set<Motif>();

  for (const [df, dr] of rays) {
    const found: Array<{ type: string; value: number }> = [];
    for (let step = 1; step < 8 && found.length < 2; step++) {
      const f = file + df * step;
      const r = rank + dr * step;
      if (f < 0 || f > 7 || r < 0 || r > 7) break;
      const square = `${String.fromCharCode(97 + f)}${r + 1}` as Square;
      const occupant = chess.get(square);
      if (!occupant) continue;
      // Our own piece blocks the ray entirely.
      if (occupant.color === byColor) break;
      found.push({ type: occupant.type, value: PIECE_VALUES[occupant.type] ?? 0 });
    }
    if (found.length < 2) continue;
    const [front, behind] = found as [{ type: string; value: number }, { type: string; value: number }];
    if (behind.type === 'k' || behind.value > front.value) motifs.add('pin');
    else if (front.value > behind.value) motifs.add('skewer');
  }
  return [...motifs];
}

export interface DeriveInput {
  id: string;
  fenBefore: string;
  userColor: Color;
  /** the move actually played, UCI */
  playedUci: string;
  playedSan: string;
  /** the engine's best move in the position before, UCI */
  bestUci?: string;
  /** how the opponent punishes the played move — UCI, from evaluating fenAfter */
  refutationPv?: string[];
  /** what the engine intended instead — UCI, from evaluating fenBefore */
  bestPv?: string[];
  /** other good moves from MultiPV, each a UCI line from fenBefore */
  alternativePvs?: string[][];
  /** user-POV evaluation at the end of the refutation line */
  refutationCp?: number;
  refutationMate?: number;
  /** user-POV evaluation at the end of the best line */
  bestCp?: number;
  bestMate?: number;
  maxPlies?: number;
}

/** Derive the deterministic teachable facts behind one mistake. */
export function deriveExplanationFacts(input: DeriveInput): ExplanationFacts {
  const maxPlies = input.maxPlies ?? DEFAULT_MAX_PLIES;
  const us = input.userColor === 'white' ? 'w' : 'b';
  const them = us === 'w' ? 'b' : 'w';
  const variations: Variation[] = [];

  // --- The refutation. Shown from BEFORE the mistake so the reader sees the
  // move they played and then watches it get punished.
  const refutation = replayUci(
    input.fenBefore,
    [input.playedUci, ...(input.refutationPv ?? [])],
    maxPlies + 1,
  );
  let hangs: HangingPiece | undefined;
  const motifs = new Set<Motif>();

  if (refutation.sans.length > 1) {
    variations.push({
      kind: 'refutation',
      label: `You played ${input.playedSan}`,
      startFen: input.fenBefore,
      sans: refutation.sans,
      ...(input.refutationMate !== undefined
        ? { mate: input.refutationMate }
        : input.refutationCp !== undefined
          ? { cp: input.refutationCp }
          : {}),
    });

    // Inspect the opponent's punishing move (the first reply).
    const afterPlayed = replayUci(input.fenBefore, [input.playedUci], 1);
    const punish = input.refutationPv?.[0];
    if (punish && punish.length >= 4) {
      const chess = new Chess(afterPlayed.endFen);
      try {
        const move = chess.move({
          from: punish.slice(0, 2),
          to: punish.slice(2, 4),
          ...(punish.length > 4 ? { promotion: punish.slice(4, 5) } : {}),
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
        if (forkTargets(chess, move.to as Square, them) >= 2) motifs.add('fork');
        for (const m of lineMotifs(chess, move.to as Square, them)) motifs.add(m);
      } catch {
        // Refutation move did not apply — leave motifs as-is rather than guess.
      }
    }
  }

  // --- The engine's own line.
  const best = input.bestPv?.length
    ? replayUci(input.fenBefore, input.bestPv, maxPlies)
    : input.bestUci
      ? replayUci(input.fenBefore, [input.bestUci], 1)
      : { sans: [], endFen: input.fenBefore };
  const bestSan = best.sans[0];
  if (bestSan) {
    variations.push({
      kind: 'best',
      label: `Better: ${bestSan}`,
      startFen: input.fenBefore,
      sans: best.sans,
      ...(input.bestMate !== undefined
        ? { mate: input.bestMate }
        : input.bestCp !== undefined
          ? { cp: input.bestCp }
          : {}),
    });
  }

  // --- Alternatives that also held.
  for (const pv of input.alternativePvs ?? []) {
    const alt = replayUci(input.fenBefore, pv, maxPlies);
    const first = alt.sans[0];
    if (!first || first === bestSan || first === input.playedSan) continue;
    variations.push({
      kind: 'alternative',
      label: `Also good: ${first}`,
      startFen: input.fenBefore,
      sans: alt.sans,
    });
  }

  const bestMoveRole = classifyBestMove(input.fenBefore, best.sans[0], hangs, us);

  const startBalance = materialBalance(input.fenBefore, input.userColor);
  const endBalance = materialBalance(refutation.endFen, input.userColor);

  return {
    id: input.id,
    fenBefore: input.fenBefore,
    userColor: input.userColor,
    playedSan: input.playedSan,
    ...(bestSan ? { bestSan } : {}),
    variations,
    ...(hangs ? { hangs } : {}),
    refutationMotifs: [...motifs],
    bestMoveRole,
    materialSwingPawns: endBalance - startBalance,
    allowedMoves: [...new Set([input.playedSan, ...variations.flatMap((v) => v.sans)])],
  };
}

/** What does the engine's move accomplish? Ordered most- to least-teachable. */
function classifyBestMove(
  fenBefore: string,
  bestSan: string | undefined,
  hangs: HangingPiece | undefined,
  us: 'w' | 'b',
): BestMoveRole {
  if (!bestSan) return 'quiet';
  let chess: Chess;
  let move;
  try {
    chess = new Chess(fenBefore);
    move = chess.move(bestSan);
  } catch {
    return 'quiet';
  }
  // Moving the piece that was about to be taken is the clearest lesson.
  if (hangs && move.from === hangs.square) return 'escape';
  if (move.captured) return 'capture';
  // Did it cover the square the opponent was going to capture on?
  if (hangs && chess.attackers(hangs.square as Square, us).length > 0) return 'defend';
  if (chess.isCheck()) return 'check';
  if (move.promotion) return 'promote';
  return 'quiet';
}

export interface RenderedExplanation {
  whatWentWrong: string;
  whyBetter: string;
  takeaway: string;
}

/**
 * Deterministic coach prose. This is the shipped fallback whenever the LLM is
 * disabled, errors, or produces ungrounded output — so it has to stand on its
 * own, not read like a placeholder.
 */
export function renderExplanation(f: ExplanationFacts): RenderedExplanation {
  const refutation = f.variations.find((v) => v.kind === 'refutation');
  // sans[0] is the user's own move; sans[1] is the opponent's punishing reply.
  const punish = refutation?.sans[1];
  const motifs = new Set(f.refutationMotifs);

  return {
    whatWentWrong: whatWentWrong(f, punish, motifs),
    whyBetter: whyBetter(f),
    takeaway: takeaway(f, motifs),
  };
}

function whatWentWrong(f: ExplanationFacts, punish: string | undefined, motifs: Set<Motif>): string {
  if (!punish) {
    return `${f.playedSan} loses ground here.`;
  }
  const parts: string[] = [];

  const loss = Math.abs(f.materialSwingPawns);

  if (motifs.has('mate')) {
    parts.push(`After ${f.playedSan}, your opponent has ${punish} and you cannot stop the mate.`);
  } else if (f.hangs && f.materialSwingPawns <= -1) {
    parts.push(
      `After ${f.playedSan}, your opponent plays ${punish}, winning your ${f.hangs.piece} on ${f.hangs.square}.`,
    );
  } else if (motifs.has('capture')) {
    parts.push(`After ${f.playedSan}, your opponent replies ${punish} and comes out on top.`);
  } else {
    parts.push(`After ${f.playedSan}, your opponent gets ${punish} and takes over the position.`);
  }

  if (motifs.has('fork')) {
    parts.push('That move attacks two things at once, so you cannot save both.');
  } else if (motifs.has('pin')) {
    parts.push('It also pins a piece, which means it cannot move out of the way.');
  } else if (motifs.has('skewer')) {
    parts.push(
      'It skewers two pieces on the same line, so moving the front one drops the one behind.',
    );
  } else if (motifs.has('check')) {
    parts.push('It comes with check, so you have to respond immediately.');
  }

  // Only quote a total when the line costs meaningfully more than the first
  // capture — otherwise "winning your pawn ... about 6 pawns" reads as a
  // contradiction rather than as the fork's follow-up cost.
  //
  // Gate on the SIGN, not the magnitude: an opponent sacrifice (common in the
  // attacking lines this feature exists to explain) can leave the user
  // materially AHEAD at the truncation point, and reporting that as "you are
  // down N pawns" would be flatly wrong.
  if (!motifs.has('mate') && f.materialSwingPawns <= -1) {
    const immediate = f.hangs?.valuePawns ?? 0;
    if (loss > immediate + 1) {
      parts.push(`By the end of the line you are down about ${formatPawns(loss)}.`);
    }
  }

  return parts.join(' ');
}

function whyBetter(f: ExplanationFacts): string {
  if (!f.bestSan) return '';
  const best = f.variations.find((v) => v.kind === 'best');
  const continuation =
    best && best.sans.length > 1 ? ` The engine's line runs ${best.sans.join(' ')}.` : '';

  const lead = ((): string => {
    switch (f.bestMoveRole) {
      case 'escape':
        return `${f.bestSan} moves the piece out of danger before it can be taken.`;
      case 'defend':
        return `${f.bestSan} defends ${f.hangs?.square ?? 'the loose square'}, so the capture no longer wins anything.`;
      case 'capture':
        return `${f.bestSan} takes first, which changes the order of the trade in your favour.`;
      case 'check':
        return `${f.bestSan} gives check, forcing your opponent to deal with that before their own plan.`;
      case 'promote':
        return `${f.bestSan} pushes through to a new queen.`;
      default:
        return `${f.bestSan} keeps your position together and denies your opponent that idea.`;
    }
  })();

  const alternatives = f.variations.filter((v) => v.kind === 'alternative');
  const also =
    alternatives.length > 0
      ? ` ${alternatives.map((a) => a.sans[0]).join(' and ')} also held the position.`
      : '';

  return `${lead}${continuation}${also}`;
}

function takeaway(f: ExplanationFacts, motifs: Set<Motif>): string {
  // Most specific lesson first. A fork that happens to start with a capture
  // should teach the fork, not "you left a pawn loose".
  if (motifs.has('mate')) {
    return 'When your king has few escape squares, check your opponent’s forcing moves before anything else.';
  }
  if (motifs.has('fork')) {
    return 'Watch for squares where one enemy piece could hit two of yours at once — especially knights near your king.';
  }
  if (motifs.has('pin') || motifs.has('skewer')) {
    return 'Avoid lining up your pieces on the same file, rank, or diagonal as your king or queen.';
  }
  if (f.hangs) {
    return `Before you move, ask what each piece is defended by — the ${f.hangs.piece} on ${f.hangs.square} was left loose.`;
  }
  return 'Before committing, give your opponent a free move in your head and ask what they would play.';
}

function formatPawns(pawns: number): string {
  return pawns === 1 ? 'a pawn' : `${pawns} pawns`;
}
