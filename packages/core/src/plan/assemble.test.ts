import { describe, it, expect } from 'vitest';
import type { WeaknessProfile } from '../profile.js';
import type { ErrorInstance } from '../profile.js';
import {
  buildPlanDraft,
  weekStartFor,
  templateGoal,
  sideToMoveOf,
  sanForUci,
  DEFAULT_MAX_THEMES,
} from './assemble.js';

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

describe('puzzle mixing (2.2b)', () => {
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
        examples: [example({ category: 'MISSED_TACTIC', fen: FEN_2, gameId: 'g3' })],
      },
    ],
  });
  const puzzles = {
    HANGING_PIECE: [
      {
        externalId: 'pz1',
        fen: FEN_2,
        solutionUci: 'a2a4',
        solutionLine: 'a2a4 a7a6 a4a5',
        rating: 1200,
      },
      {
        externalId: 'pz2',
        fen: FEN_1,
        solutionUci: 'b1c3',
        solutionLine: 'b1c3 b8c6 a2a4',
        rating: 1300,
      },
      {
        externalId: 'pz3',
        fen: FEN_1,
        solutionUci: 'c2c4',
        solutionLine: 'c2c4 c7c5',
        rating: 1100,
      },
    ],
  };

  it('appends up to puzzlesPerTheme puzzle drills after own-game drills', () => {
    const draft = buildPlanDraft(p, { puzzlesByTheme: puzzles, puzzlesPerTheme: 2 });
    const drills = draft.items[0]!.drills;
    expect(drills).toHaveLength(4); // 2 own + 2 puzzles (pz3 capped)
    expect(drills.slice(2).map((d) => d.puzzleId)).toEqual(['pz1', 'pz2']);
    expect(drills[2]!.type).toBe('puzzle');
    expect(drills[0]!.type).toBe('own_game');
  });

  it('derives puzzle side to move from the (post-setup) FEN, copies line, fills SAN', () => {
    const draft = buildPlanDraft(p, { puzzlesByTheme: puzzles, puzzlesPerTheme: 3 });
    const pz = draft.items[0]!.drills[3]!;
    expect(pz.sideToMove).toBe('white'); // FEN_2 turn field
    expect(pz.solutionLine).toBe('b1c3 b8c6 a2a4'); // pz2
    expect(pz.solutionSan).toBeTruthy(); // SAN computed via chess.js
    expect(pz.gameId).toBeUndefined();
    expect(pz.playedMoveSan).toBeUndefined();
  });

  it('keeps a theme with no own-game examples but puzzle candidates', () => {
    const onlyPuzzles = profile({
      topWeaknesses: ['ENDGAME_TECHNIQUE'],
      categories: [],
    });
    const draft = buildPlanDraft(onlyPuzzles, {
      puzzlesByTheme: {
        ENDGAME_TECHNIQUE: [
          {
            externalId: 'pz9',
            fen: FEN_1,
            solutionUci: 'a2a3',
            solutionLine: 'a2a3 a7a5',
            rating: 1000,
          },
        ],
      },
    });
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0]!.drills).toHaveLength(1);
    expect(draft.items[0]!.drills[0]!.type).toBe('puzzle');
  });

  it('goal counts include puzzle drills', () => {
    const draft = buildPlanDraft(p, { puzzlesByTheme: puzzles, puzzlesPerTheme: 2 });
    expect(draft.items[0]!.goal).toContain('4 positions');
  });
});

describe('helpers', () => {
  it('sideToMoveOf reads the FEN turn field', () => {
    expect(sideToMoveOf(FEN_1)).toBe('white');
    expect(sideToMoveOf(FEN_1.replace(' w ', ' b '))).toBe('black');
  });

  it('sanForUci converts UCI to SAN on a position', () => {
    // Starting position: e2e4 is e4.
    expect(sanForUci('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4')).toBe('e4');
    expect(sanForUci('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4q')).toBe('e4'); // promotion ignored when N/A
    expect(sanForUci('not a fen', 'e2e4')).toBeUndefined();
  });
});
