/**
 * Test factories. Detectors consume pre-computed ScoredMoves, so tests build
 * them directly with known features — deterministic and engine-independent
 * (spec §9.3). No vendor, no randomness.
 */
import type { DetectorMove } from '../detectors/types.js';
import type { ImportedGame, MoveSeverity } from '../types.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function makeGame(overrides: Partial<ImportedGame> = {}): ImportedGame {
  return {
    id: 'testgame',
    pgn: '',
    white: 'mockuser',
    black: 'opp',
    userColor: 'white',
    result: '1-0',
    timeControl: '300+0',
    playedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeMove(overrides: Partial<DetectorMove> = {}): DetectorMove {
  return {
    gameId: 'testgame',
    ply: 0,
    moveNumber: 1,
    san: 'e4',
    uci: 'e2e4',
    fenBefore: START_FEN,
    fenAfter: START_FEN,
    cpBefore: 0,
    cpAfter: 0,
    cpl: 0,
    bestMove: 'd2d4', // differs from the played e2e4/e4 (avoids the played==best net)
    phase: 'middlegame',
    isCapture: false,
    isCheck: false,
    bestMoveForcing: false,
    userMaterialLossNextPly: 0,
    decided: false,
    ...overrides,
  };
}

/** Convenience: a move with a given severity and cpl. */
export function moveWith(
  severity: MoveSeverity | undefined,
  overrides: Partial<DetectorMove> = {},
): DetectorMove {
  const cpl = severity === 'blunder' ? 400 : severity === 'mistake' ? 150 : severity === 'inaccuracy' ? 70 : 10;
  return makeMove({ severity, cpl, ...overrides });
}
