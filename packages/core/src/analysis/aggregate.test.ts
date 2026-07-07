import { describe, it, expect } from 'vitest';
import { aggregateProfile, instanceImpact } from './aggregate.js';
import { renderReportTemplate } from './renderTemplate.js';
import { makeGame, moveWith } from '../test/factories.js';
import type { GameContext } from '../detectors/types.js';

const engineMeta = { kind: 'mock', movetimeMs: 150 };

function hangingContext(): GameContext {
  return {
    game: makeGame({ id: 'g1' }),
    moves: [moveWith('blunder', { userMaterialLossNextPly: 5, cpl: 500 })],
  };
}

describe('aggregateProfile', () => {
  it('ranks categories by estimated rating loss and marks low confidence', () => {
    const contexts: GameContext[] = [hangingContext(), hangingContext()];
    const profile = aggregateProfile({
      username: 'mockuser',
      source: 'mock',
      contexts,
      movesScored: 40,
      engineMeta,
    });
    expect(profile.gamesAnalyzed).toBe(2);
    expect(profile.lowConfidence).toBe(true); // < 10 games
    expect(profile.topWeaknesses[0]).toBe('HANGING_PIECE');
    const hanging = profile.categories.find((c) => c.category === 'HANGING_PIECE')!;
    expect(hanging.frequency).toBe(2);
    expect(hanging.examples.length).toBeLessThanOrEqual(3);
  });

  it('produces at most 3 top weaknesses', () => {
    const profile = aggregateProfile({
      username: 'u',
      source: 'mock',
      contexts: [hangingContext()],
      movesScored: 1,
      engineMeta,
    });
    expect(profile.topWeaknesses.length).toBeLessThanOrEqual(3);
  });

  it('is deterministic given the same input', () => {
    const input = {
      username: 'u',
      source: 'mock',
      contexts: [hangingContext()],
      movesScored: 1,
      engineMeta,
    };
    expect(aggregateProfile(input)).toEqual(aggregateProfile(input));
  });
});

describe('single-assignment de-dup', () => {
  it('counts an endgame hanging piece only under HANGING_PIECE, not ENDGAME_TECHNIQUE', () => {
    // One move that both detectors would claim: a material-dropping blunder in
    // the endgame phase. Priority gives it to HANGING_PIECE.
    const ctx: GameContext = {
      game: makeGame({ id: 'g1' }),
      moves: [
        moveWith('blunder', {
          ply: 40,
          phase: 'endgame',
          userMaterialLossNextPly: 5,
          cpl: 500,
          cpBefore: 100,
        }),
      ],
    };
    const profile = aggregateProfile({
      username: 'u',
      source: 'mock',
      contexts: [ctx],
      movesScored: 1,
      engineMeta,
    });
    const cats = profile.categories.map((c) => c.category);
    expect(cats).toContain('HANGING_PIECE');
    expect(cats).not.toContain('ENDGAME_TECHNIQUE');
  });
});

describe('example selection', () => {
  it('honors maxExamples and spreads across distinct games', () => {
    const contexts: GameContext[] = Array.from({ length: 6 }, (_, i) => ({
      game: makeGame({ id: `g${i}` }),
      moves: [moveWith('blunder', { ply: 10, userMaterialLossNextPly: 4, cpl: 300, cpBefore: 50 })],
    }));
    const profile = aggregateProfile({
      username: 'u',
      source: 'mock',
      contexts,
      movesScored: 6,
      engineMeta,
      maxExamples: 4,
    });
    const hanging = profile.categories.find((c) => c.category === 'HANGING_PIECE')!;
    expect(hanging.frequency).toBe(6);
    expect(hanging.examples).toHaveLength(4); // capped
    expect(new Set(hanging.examples.map((e) => e.gameId)).size).toBe(4); // distinct games
  });

  it('prefers mistakes from competitive positions over already-winning ones', () => {
    const ctx: GameContext = {
      game: makeGame({ id: 'g1' }),
      moves: [
        moveWith('blunder', { ply: 10, userMaterialLossNextPly: 4, cpl: 300, cpBefore: 700 }), // already winning
        moveWith('blunder', { ply: 20, userMaterialLossNextPly: 4, cpl: 300, cpBefore: 0 }), // competitive
      ],
    };
    const profile = aggregateProfile({
      username: 'u',
      source: 'mock',
      contexts: [ctx],
      movesScored: 2,
      engineMeta,
      maxExamples: 1,
    });
    const hanging = profile.categories.find((c) => c.category === 'HANGING_PIECE')!;
    expect(hanging.examples[0]!.cpBefore).toBe(0); // competitive one chosen first
  });
});

describe('instanceImpact', () => {
  it('is bounded', () => {
    expect(instanceImpact(0)).toBe(2);
    expect(instanceImpact(100000)).toBe(60);
  });
});

describe('renderReportTemplate', () => {
  it('renders a complete degraded report from a profile', () => {
    const profile = aggregateProfile({
      username: 'mockuser',
      source: 'mock',
      contexts: [hangingContext()],
      movesScored: 20,
      engineMeta,
    });
    const content = renderReportTemplate(profile);
    expect(content.degraded).toBe(true);
    expect(content.weaknesses.length).toBeGreaterThan(0);
    expect(content.weaknesses[0]!.recommendation).toBeTruthy();
    expect(content.confidenceNote).toBeTruthy(); // low confidence sample
  });
});
