/**
 * Centipawn-loss scoring (spec §9.1.4). Converts engine evals into ScoredMoves
 * from the USER's perspective, with win-probability-aware severity so we don't
 * over-flag moves in already-decided positions. Pure functions, no I/O.
 */
import { Chess } from 'chess.js';
import type { EngineEval, MoveSeverity, ScoredMove } from '../types.js';
import type { ParsedGame, Ply } from './parse.js';

/** cp thresholds aligned with Lichess conventions (spec §9.1.4). */
export const INACCURACY_CP = 50;
export const MISTAKE_CP = 100;
export const BLUNDER_CP = 300;

/** Win-probability drop required alongside the cp threshold (robustness). */
export const INACCURACY_WP = 0.05;
export const MISTAKE_WP = 0.1;
export const BLUNDER_WP = 0.2;

const CP_CLAMP = 2000;

/**
 * A position is "already decided" when one side is winning by ~6 pawns before
 * the move. Errors from decided positions are not instructive (kicking a dead
 * horse) and cluster at game end, so most detectors skip them.
 */
export const DECIDED_CP = 600;

/** Normalize an EngineEval (side-to-move POV) to a bounded centipawn number. */
export function cpFromEval(e: EngineEval): number {
  if (typeof e.mate === 'number') {
    const sign = e.mate === 0 ? 1 : Math.sign(e.mate);
    return sign * CP_CLAMP;
  }
  return clamp(e.cp ?? 0, -CP_CLAMP, CP_CLAMP);
}

/** Lichess win-probability model, returns P(win) in [0,1] for the given cp. */
export function winProbability(cp: number): number {
  return 1 / (1 + Math.exp(-0.00368208 * cp));
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Normalize a UCI move for comparison (lowercase, trimmed). */
export function normalizeUci(uci: string): string {
  return uci.trim().toLowerCase();
}

/**
 * Classify severity from centipawn loss AND win-probability drop. Both must
 * clear a threshold — a large cp swing in an already-lost position (small win%
 * change) is not flagged as a blunder.
 */
export function classifySeverity(cpl: number, winProbDrop: number): MoveSeverity | undefined {
  if (cpl >= BLUNDER_CP && winProbDrop >= BLUNDER_WP) return 'blunder';
  if (cpl >= MISTAKE_CP && winProbDrop >= MISTAKE_WP) return 'mistake';
  if (cpl >= INACCURACY_CP && winProbDrop >= INACCURACY_WP) return 'inaccuracy';
  return undefined;
}

/** Lookup of engine eval keyed by FEN (side-to-move POV). */
export type EvalLookup = (fen: string) => EngineEval | undefined;

/** Is the given UCI bestMove a capture or check in the position? (forcing) */
function bestMoveIsForcing(fen: string, uci: string): boolean {
  if (!uci || uci.length < 4) return false;
  try {
    const chess = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
    const move = chess.move({ from, to, promotion });
    return move.flags.includes('c') || move.flags.includes('e') || move.san.includes('+');
  } catch {
    return false;
  }
}

export interface ScoreExtras {
  /** whether the engine's best move was a forcing shot the user missed */
  bestMoveForcing: boolean;
  userMaterialLossNextPly: number;
  /** position was already ~winning/losing before this move (|cpBefore| >= DECIDED_CP) */
  decided: boolean;
}

/**
 * Score every USER move for which we have evals for the positions before and
 * after the move. Moves lacking evals are skipped (spec §9.1.3 — trivial/forced
 * positions may be skipped to save compute).
 */
export function scoreUserMoves(
  parsed: ParsedGame,
  lookup: EvalLookup,
): Array<ScoredMove & ScoreExtras> {
  const out: Array<ScoredMove & ScoreExtras> = [];
  for (const ply of parsed.plies) {
    if (!ply.userMove) continue;
    const evalBefore = lookup(ply.fenBefore);
    const evalAfter = lookup(ply.fenAfter);
    if (!evalBefore || !evalAfter) continue;

    // fenBefore has the user to move → side-to-move POV == user POV.
    const cpBefore = cpFromEval(evalBefore);
    // fenAfter has the opponent to move → negate to get user POV.
    const cpAfter = -cpFromEval(evalAfter);
    const cpl = clamp(cpBefore - cpAfter, 0, CP_CLAMP);
    const winProbDrop = winProbability(cpBefore) - winProbability(cpAfter);
    // You cannot have made a mistake if you played the engine's own top move —
    // any apparent swing is engine search noise (movetime-budgeted eval). This
    // guard eliminates false positives where played move == best move.
    const playedBestMove = normalizeUci(ply.uci) === normalizeUci(evalBefore.bestMove);
    const severity = playedBestMove ? undefined : classifySeverity(cpl, winProbDrop);

    out.push({
      gameId: parsed.game.id,
      ply: ply.index,
      moveNumber: ply.moveNumber,
      san: ply.san,
      uci: ply.uci,
      fenBefore: ply.fenBefore,
      fenAfter: ply.fenAfter,
      cpBefore,
      cpAfter,
      cpl,
      bestMove: evalBefore.bestMove,
      severity,
      phase: ply.phase,
      isCapture: ply.isCapture,
      isCheck: ply.isCheck,
      clockRemaining: clockAt(parsed.game, ply),
      bestMoveForcing: bestMoveIsForcing(ply.fenBefore, evalBefore.bestMove),
      userMaterialLossNextPly: ply.userMaterialLossNextPly ?? 0,
      decided: Math.abs(cpBefore) >= DECIDED_CP,
    });
  }
  return out;
}

function clockAt(game: ParsedGame['game'], ply: Ply): number | undefined {
  return game.clocks?.[ply.index];
}
