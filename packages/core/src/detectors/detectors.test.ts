import { describe, it, expect } from 'vitest';
import { makeGame, makeMove, moveWith } from '../test/factories.js';
import { hangingPieceDetector } from './hangingPiece.js';
import { missedTacticDetector } from './missedTactic.js';
import { openingInaccuracyDetector } from './openingInaccuracy.js';
import { failedConversionDetector } from './failedConversion.js';
import { weakDefenseDetector } from './weakDefense.js';
import { endgameTechniqueDetector } from './endgameTechnique.js';
import { timeTroubleDetector } from './timeTrouble.js';
import { positionalDriftDetector } from './positionalDrift.js';

describe('hangingPieceDetector', () => {
  it('flags a blunder that drops a minor piece', () => {
    const ctx = {
      game: makeGame(),
      moves: [moveWith('blunder', { userMaterialLossNextPly: 3 })],
    };
    expect(hangingPieceDetector.detect(ctx)).toHaveLength(1);
  });
  it('ignores a blunder that kept material (e.g. a sound sacrifice line)', () => {
    const ctx = { game: makeGame(), moves: [moveWith('blunder', { userMaterialLossNextPly: 0 })] };
    expect(hangingPieceDetector.detect(ctx)).toHaveLength(0);
  });
  it('ignores a hang in an already-decided position (not instructive)', () => {
    const ctx = {
      game: makeGame(),
      moves: [moveWith('blunder', { userMaterialLossNextPly: 5, decided: true })],
    };
    expect(hangingPieceDetector.detect(ctx)).toHaveLength(0);
  });
});

describe('missedTacticDetector', () => {
  it('flags a big swing where the best move was forcing and not played', () => {
    const ctx = {
      game: makeGame(),
      moves: [
        moveWith('mistake', {
          san: 'Rd1',
          bestMove: 'f3g5',
          bestMoveForcing: true,
          userMaterialLossNextPly: 0,
        }),
      ],
    };
    expect(missedTacticDetector.detect(ctx)).toHaveLength(1);
  });
  it('does not double-count a hanging-piece blunder', () => {
    const ctx = {
      game: makeGame(),
      moves: [moveWith('blunder', { bestMoveForcing: true, userMaterialLossNextPly: 5 })],
    };
    expect(missedTacticDetector.detect(ctx)).toHaveLength(0);
  });
});

describe('openingInaccuracyDetector', () => {
  it('flags any severity within the first 10 moves', () => {
    const ctx = { game: makeGame(), moves: [moveWith('inaccuracy', { moveNumber: 6 })] };
    expect(openingInaccuracyDetector.detect(ctx)).toHaveLength(1);
  });
  it('ignores later-game errors', () => {
    const ctx = { game: makeGame(), moves: [moveWith('mistake', { moveNumber: 25 })] };
    expect(openingInaccuracyDetector.detect(ctx)).toHaveLength(0);
  });
});

describe('failedConversionDetector', () => {
  it('flags reaching +2 then not winning', () => {
    const ctx = {
      game: makeGame({ result: '0-1', userColor: 'white' }),
      moves: [makeMove({ cpBefore: 350 }), makeMove({ cpBefore: 100 })],
    };
    const found = failedConversionDetector.detect(ctx);
    expect(found).toHaveLength(1);
    expect(found[0]!.cpl).toBe(0); // cites the peak position
  });
  it('does not flag when the user won', () => {
    const ctx = {
      game: makeGame({ result: '1-0', userColor: 'white' }),
      moves: [makeMove({ cpBefore: 350 })],
    };
    expect(failedConversionDetector.detect(ctx)).toHaveLength(0);
  });
});

describe('weakDefenseDetector', () => {
  it('flags a collapse from a holdable-but-worse position', () => {
    const ctx = {
      game: makeGame(),
      moves: [moveWith('blunder', { cpBefore: -300, cpAfter: -600 })],
    };
    expect(weakDefenseDetector.detect(ctx)).toHaveLength(1);
  });
  it('ignores errors from an equal position', () => {
    const ctx = { game: makeGame(), moves: [moveWith('blunder', { cpBefore: 20, cpAfter: -500 })] };
    expect(weakDefenseDetector.detect(ctx)).toHaveLength(0);
  });
  it('ignores collapses from an already dead-lost position', () => {
    const ctx = {
      game: makeGame(),
      moves: [moveWith('blunder', { cpBefore: -900, cpAfter: -1800 })],
    };
    expect(weakDefenseDetector.detect(ctx)).toHaveLength(0);
  });
});

describe('endgameTechniqueDetector', () => {
  it('flags mistakes in the endgame phase', () => {
    const ctx = { game: makeGame(), moves: [moveWith('mistake', { phase: 'endgame' })] };
    expect(endgameTechniqueDetector.detect(ctx)).toHaveLength(1);
  });
});

describe('timeTroubleDetector', () => {
  it('flags a blunder with a low clock', () => {
    const ctx = { game: makeGame(), moves: [moveWith('blunder', { clockRemaining: 800 })] };
    expect(timeTroubleDetector.detect(ctx)).toHaveLength(1);
  });
  it('ignores when clock data is absent', () => {
    const ctx = { game: makeGame(), moves: [moveWith('blunder', { clockRemaining: undefined })] };
    expect(timeTroubleDetector.detect(ctx)).toHaveLength(0);
  });
});

describe('positionalDriftDetector', () => {
  it('flags 3+ inaccuracies with no blunder', () => {
    const ctx = {
      game: makeGame(),
      moves: [moveWith('inaccuracy'), moveWith('inaccuracy'), moveWith('inaccuracy')],
    };
    expect(positionalDriftDetector.detect(ctx)).toHaveLength(1);
  });
  it('does not fire if a blunder is present', () => {
    const ctx = {
      game: makeGame(),
      moves: [moveWith('inaccuracy'), moveWith('inaccuracy'), moveWith('inaccuracy'), moveWith('blunder')],
    };
    expect(positionalDriftDetector.detect(ctx)).toHaveLength(0);
  });
});
