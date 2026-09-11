import { describe, it, expect } from 'vitest';
import type { WeaknessProfile } from '../profile.js';
import type { ErrorInstance } from '../profile.js';
import { buildPlanDraft, weekStartFor, templateGoal, DEFAULT_MAX_THEMES } from './assemble.js';

const FEN_1 = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1';
const FEN_2 = 'r1bqkbnr/ppp2ppp/2np4/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1';

function example(_overrides: Partial<ErrorInstance> = {}): ErrorInstance {
  return {
    category: 'HANGING_PIECE',
    gameId: 'g1',
    moveNumber: 12,
    ply: 23,
    fen: FEN_1,
    playedMove: 'Qxf7#?',
    playedMoveUci: 'f3f7',
    betterMove: 'f3d3',
    betterMoveSan: 'Qd3',
    cpl: 350,
    cpBefore: 40,
    cpAfter: -280,
    assessment: 'balanced (+0.4)',
    userColor: 'white',
    note: 'the queen went off to be captured',
  };
}

function profile(overrides: Partial<WeaknessProfile> = {}): WeaknessProfile {
  return {
    username: 'mockuser',
    source: 'lichess',
    gamesAnalyzed: 12,
    movesScored: 400,
    lowConfidence: false,
    categories: [],
    topWeaknesses: [],
    engineMeta: { kind: 'mock' },
    ...overrides,
  };
}

describe('weekStartFor', () => {
  it('returns the Monday 00:00 UTC of the same week', () => {
    // 2026-09-09 is a Wednesday.
    const wed = new Date('2026-09-09T15:30:00Z');
    const monday = weekStartFor(wed);
    expect(monday.toISOString()).toBe('2026-09-07T00:00:00.000Z');
  });

  it('maps a Sunday to the previous Monday', () => {
    const sun = new Date('2026-09-13T22:00:00Z');
    expect(weekStartFor(sun).toISOString()).toBe('2026-09-07T00:00:00.000Z');
  });

  it('maps a Monday to itself at midnight', () => {
    const mon = new Date('2026-09-07T09:00:00Z');
    expect(weekStartFor(mon).toISOString()).toBe('2026-09-07T00:00:00.000Z');
  });
});

describe('buildPlanDraft', () => {
  const p = profile({
    topWeaknesses: ['HANGING_PIECE', 'MISSED_TACTIC'],
    categories: [
      {
        category: 'HANGING_PIECE',
        frequency: 6,
        estimatedRatingLoss: 90,
        examples: [example(), example({ fen: FEN_2, gameId: 'g2', ply: 31, moveNumber: 16 })],
      },
      {
        category: 'MISSED_TACTIC',
        frequency: 3,
        estimatedRatingLoss: 40,
        examples: [
          example({
            category: 'MISSED_TACTIC',
            fen: FEN_2,
            gameId: 'g3',
            betterMove: 'a2a4',
            betterMoveSan: 'a4',
            userColor: 'black',
          }),
        ],
      },
      {
        category: 'ENDGAME_TECHNIQUE',
        frequency: 1,
        estimatedRatingLoss: 10,
        examples: [example({ category: 'ENDGAME_TECHNIQUE' })],
      },
    ],
  });

  it('focuses on the top themes only', () => {
    const draft = buildPlanDraft(p);
    expect(draft.items).toHaveLength(2); // ENDGAME_TECHNIQUE is outside top-2
    expect(draft.items.map((i) => i.theme)).toEqual(['HANGING_PIECE', 'MISSED_TACTIC']);
  });

  it('caps drills per theme', () => {
    const many = profile({
      topWeaknesses: ['HANGING_PIECE'],
      categories: [
        {
          category: 'HANGING_PIECE',
          frequency: 10,
          estimatedRatingLoss: 100,
          examples: Array.from({ length: 12 }, (_, i) => example({ gameId: `g${i}` })),
        },
      ],
    });
    const draft = buildPlanDraft(many, { drillsPerTheme: 5 });
    expect(draft.items[0]!.drills).toHaveLength(5);
  });

  it('copies example facts into drills verbatim (side to move = user color)', () => {
    const draft = buildPlanDraft(p);
    const drill = draft.items[0]!.drills[0]!;
    expect(drill.type).toBe('own_game');
    expect(drill.fen).toBe(FEN_1);
    expect(drill.sideToMove).toBe('white');
    expect(drill.solutionUci).toBe('f3d3');
    expect(drill.solutionSan).toBe('Qd3');
    expect(drill.playedMoveSan).toBe('Qxf7#?');
    expect(drill.gameId).toBe('g1');
    expect(drill.note).toContain('queen');
  });

  it('skips themes without examples', () => {
    const empty = profile({
      topWeaknesses: ['TIME_TROUBLE'],
      categories: [{ category: 'TIME_TROUBLE', frequency: 0, estimatedRatingLoss: 0, examples: [] }],
    });
    expect(buildPlanDraft(empty).items).toHaveLength(0);
  });

  it('defaults to 2 themes', () => {
    const three = profile({
      topWeaknesses: ['HANGING_PIECE', 'MISSED_TACTIC', 'ENDGAME_TECHNIQUE'],
      categories: p.categories,
    });
    const draft = buildPlanDraft(three);
    expect(draft.items).toHaveLength(DEFAULT_MAX_THEMES);
  });

  it('goals reference the drill count', () => {
    const draft = buildPlanDraft(p);
    expect(draft.items[0]!.goal).toContain('2 positions');
    expect(draft.items[1]!.goal).toContain('1 position');
  });
});

describe('templateGoal', () => {
  it('uses the taxonomy description plus the weekly framing', () => {
    const goal = templateGoal({
      theme: 'HANGING_PIECE',
      displayName: 'Hanging pieces',
      instanceCount: 6,
      drillCount: 5,
    });
    expect(goal).toContain('undefended');
    expect(goal).toContain('5 positions');
  });
});
