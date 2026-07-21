import { describe, it, expect, vi } from 'vitest';
import type {
  ChessEngine,
  EngineEval,
  ErrorInstance,
  WeaknessProfile,
} from '@chess-coach/core';
import { applyEnrichments, deepenProfile, exampleKey, selectTargets } from './deepen.js';

/** White knight on d5 is undefended; f4 leaves it to be taken by Nxd5. */
const HANGING = 'r1bqkb1r/pppp1ppp/2n2n2/3N4/8/5P2/PPPPP1PP/R1BQKBNR w KQkq - 0 5';

function makeExample(overrides: Partial<ErrorInstance> = {}): ErrorInstance {
  return {
    category: 'HANGING_PIECE',
    gameId: 'g1',
    moveNumber: 5,
    ply: 8,
    fen: HANGING,
    playedMove: 'f4',
    playedMoveUci: 'f3f4',
    betterMove: 'd5c3',
    betterMoveSan: 'Nc3',
    cpl: 300,
    cpBefore: 100,
    cpAfter: -200,
    assessment: 'clearly better (+1.0)',
    userColor: 'white',
    note: 'The engine preferred Nc3.',
    ...overrides,
  };
}

function makeProfile(examples: ErrorInstance[]): WeaknessProfile {
  return {
    username: 'tester',
    source: 'lichess',
    gamesAnalyzed: 5,
    movesScored: 100,
    categories: [{ category: 'HANGING_PIECE', frequency: examples.length, estimatedRatingLoss: 40, examples }],
    topWeaknesses: ['HANGING_PIECE'],
    lowConfidence: false,
    engineMeta: { kind: 'mock', depth: 12 },
  } as unknown as WeaknessProfile;
}

/** Engine that answers the two questions the deep pass asks. */
function fakeEngine(overrides: Partial<Record<string, EngineEval>> = {}): ChessEngine {
  return {
    name: 'fake',
    dispose: async () => {},
    evaluate: vi.fn(async (fen: string): Promise<EngineEval> => {
      if (overrides[fen]) return overrides[fen]!;
      if (fen.startsWith('r1bqkb1r/pppp1ppp/2n2n2/3N4/8/5P2/PPPPP1PP/R1BQKBNR w')) {
        // Position before the mistake: engine wants Nc3, with Ne3 as an alternative.
        return {
          cp: 100,
          bestMove: 'd5c3',
          pv: ['d5c3'],
          depth: 20,
          lines: [
            { rank: 1, cp: 100, pv: ['d5c3'], depth: 20 },
            { rank: 2, cp: 80, pv: ['d5e3'], depth: 20 },
          ],
        };
      }
      // Position after f4: black to move and wins the knight.
      return { cp: 300, bestMove: 'f6d5', pv: ['f6d5'], depth: 20 };
    }),
  };
}

const opts = { depth: 20, multiPv: 3, maxPositions: 40, maxPvPlies: 6 };

describe('exampleKey', () => {
  it('is stable and unique per game+ply', () => {
    expect(exampleKey({ gameId: 'abc', ply: 12 })).toBe('abc:12');
  });
});

describe('selectTargets', () => {
  it('orders by centipawn loss so a low cap keeps the worst blunders', () => {
    const profile = makeProfile([
      makeExample({ ply: 1, cpl: 100 }),
      makeExample({ ply: 2, cpl: 500 }),
      makeExample({ ply: 3, cpl: 300 }),
    ]);
    expect(selectTargets(profile, 2).map((e) => e.ply)).toEqual([2, 3]);
  });

  it('respects the cap', () => {
    const profile = makeProfile([1, 2, 3, 4, 5].map((ply) => makeExample({ ply })));
    expect(selectTargets(profile, 3)).toHaveLength(3);
  });

  it('dedupes an example cited by both a weakness and a position type', () => {
    const shared = makeExample({ ply: 8 });
    const profile = {
      ...makeProfile([shared]),
      positionTypes: [{ type: 'IQP', examples: [shared, makeExample({ ply: 9 })] }],
    } as unknown as WeaknessProfile;
    const keys = selectTargets(profile, 40).map(exampleKey);
    expect(keys).toEqual(['g1:8', 'g1:9']);
  });

  it('ignores categories that are not top weaknesses', () => {
    const profile = {
      ...makeProfile([makeExample({ ply: 8 })]),
      categories: [
        { category: 'HANGING_PIECE', frequency: 1, estimatedRatingLoss: 40, examples: [makeExample({ ply: 8 })] },
        { category: 'TIME_TROUBLE', frequency: 9, estimatedRatingLoss: 90, examples: [makeExample({ ply: 99 })] },
      ],
    } as unknown as WeaknessProfile;
    expect(selectTargets(profile, 40).map((e) => e.ply)).toEqual([8]);
  });

  it('returns nothing when there are no examples', () => {
    expect(selectTargets(makeProfile([]), 40)).toEqual([]);
  });
});

describe('deepenProfile', () => {
  it('attaches an explanation and steppable variations', async () => {
    const profile = makeProfile([makeExample()]);
    const { profile: out, facts } = await deepenProfile(profile, fakeEngine(), opts);

    const ex = out.categories[0]!.examples[0]!;
    expect(ex.explanation?.source).toBe('template');
    expect(ex.explanation?.whatWentWrong).toContain('Nxd5');
    expect(ex.variations?.map((v) => v.kind)).toEqual(['refutation', 'best', 'alternative']);
    expect(facts.get('g1:8')?.hangs?.piece).toBe('knight');
  });

  it('shows the refutation from before the mistake, played move first', async () => {
    const { profile: out } = await deepenProfile(makeProfile([makeExample()]), fakeEngine(), opts);
    const refutation = out.categories[0]!.examples[0]!.variations!.find(
      (v) => v.kind === 'refutation',
    );
    expect(refutation?.sans).toEqual(['f4', 'Nxd5']);
    expect(refutation?.startFen).toBe(HANGING);
  });

  it('does not mutate the input profile', async () => {
    const profile = makeProfile([makeExample()]);
    await deepenProfile(profile, fakeEngine(), opts);
    expect(profile.categories[0]!.examples[0]!.explanation).toBeUndefined();
    expect(profile.categories[0]!.examples[0]!.variations).toBeUndefined();
  });

  it('asks the engine for MultiPV before the move and a single line after it', async () => {
    const engine = fakeEngine();
    await deepenProfile(makeProfile([makeExample()]), engine, opts);
    const calls = (engine.evaluate as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]![1]).toEqual({ depth: 20, multiPv: 3 });
    expect(calls[1]![1]).toEqual({ depth: 20 });
  });

  it('keeps the existing note when the engine throws on a position', async () => {
    const engine: ChessEngine = {
      name: 'broken',
      dispose: async () => {},
      evaluate: vi.fn(async () => {
        throw new Error('engine died');
      }),
    };
    const profile = makeProfile([makeExample()]);
    const { profile: out, facts } = await deepenProfile(profile, engine, opts);
    expect(facts.size).toBe(0);
    const ex = out.categories[0]!.examples[0]!;
    expect(ex.explanation).toBeUndefined();
    expect(ex.note).toBe('The engine preferred Nc3.');
  });

  it('isolates a failure to the position that caused it', async () => {
    let calls = 0;
    const engine: ChessEngine = {
      name: 'flaky',
      dispose: async () => {},
      evaluate: vi.fn(async (fen: string): Promise<EngineEval> => {
        calls++;
        if (calls <= 2) throw new Error('transient');
        if (fen.includes(' w ')) return { cp: 100, bestMove: 'd5c3', pv: ['d5c3'], depth: 20 };
        return { cp: 300, bestMove: 'f6d5', pv: ['f6d5'], depth: 20 };
      }),
    };
    const profile = makeProfile([makeExample({ ply: 8, cpl: 500 }), makeExample({ ply: 9, cpl: 100 })]);
    const { facts } = await deepenProfile(profile, engine, opts);
    // The first (higher-cpl) target failed; the second still succeeded.
    expect(facts.has('g1:8')).toBe(false);
    expect(facts.has('g1:9')).toBe(true);
  });

  it('skips examples with no recorded UCI for the played move', async () => {
    const engine = fakeEngine();
    const profile = makeProfile([makeExample({ playedMoveUci: undefined })]);
    const { facts } = await deepenProfile(profile, engine, opts);
    expect(facts.size).toBe(0);
    expect(engine.evaluate).not.toHaveBeenCalled();
  });

  it('reports progress through the heartbeat', async () => {
    const beats: Array<[number, number]> = [];
    const profile = makeProfile([makeExample({ ply: 8 }), makeExample({ ply: 9 })]);
    await deepenProfile(profile, fakeEngine(), opts, async (done, total) => {
      beats.push([done, total]);
    });
    expect(beats).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('does no engine work when there is nothing to explain', async () => {
    const engine = fakeEngine();
    const { facts } = await deepenProfile(makeProfile([]), engine, opts);
    expect(facts.size).toBe(0);
    expect(engine.evaluate).not.toHaveBeenCalled();
  });
});

describe('applyEnrichments', () => {
  it('returns the profile untouched when there is nothing to apply', () => {
    const profile = makeProfile([makeExample()]);
    expect(applyEnrichments(profile, new Map())).toBe(profile);
  });

  it('leaves examples without an enrichment alone', () => {
    const profile = makeProfile([makeExample({ ply: 8 }), makeExample({ ply: 9 })]);
    const out = applyEnrichments(
      profile,
      new Map([
        [
          'g1:8',
          {
            explanation: {
              whatWentWrong: 'x',
              whyBetter: 'y',
              takeaway: 'z',
              source: 'template' as const,
            },
            variations: [],
          },
        ],
      ]),
    );
    expect(out.categories[0]!.examples[0]!.explanation?.whatWentWrong).toBe('x');
    expect(out.categories[0]!.examples[1]!.explanation).toBeUndefined();
  });
});
