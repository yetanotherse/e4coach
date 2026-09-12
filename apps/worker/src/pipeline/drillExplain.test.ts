import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@chess-coach/db';
import type { ChessEngine, EngineEval, LlmProvider, LlmResult } from '@chess-coach/core';
import { explainPuzzleDrills, DEFAULT_DRILL_EXPLAIN_LLM_OPTIONS } from './drillExplain.js';

/**
 * In-memory stand-ins covering exactly the calls explainPuzzleDrills makes.
 * The puzzle: the opponent just played g6 (Puzzle.line[0]), leaving the solver
 * (white) a strong check Ra8 on the open back rank.
 */
const PUZZLE_FEN = '6k1/5pp1/6p1/8/8/8/8/R5K1 w - - 0 1';
const PUZZLE_SOURCE_FEN = '6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 1'; // one move before; g7g6 was the setup

function engineEvals(): Record<string, EngineEval> {
  return {
    // Keys are board+turn only (ignore move counters).
    '6k1/5pp1/6p1/8/8/8/8/R5K1 w': {
      cp: 500,
      depth: 20,
      bestMove: 'a1a8',
      pv: ['a1a8'],
      lines: [{ rank: 2, cp: 120, pv: ['a1a2'], depth: 20 }],
    },
    // After Ra8 the opponent is to move and far worse off — negative from
    // their POV.
    'R5k1/5pp1/6p1/8/8/8/8/6K1 b': { cp: -900, depth: 20, bestMove: 'g8f8', pv: ['g8f8'] },
  };
}

function fakeEngine(evals: Record<string, EngineEval>): ChessEngine {
  return {
    name: 'test-engine',
    evaluate: vi.fn(async (fen: string) => {
      const found = evals[fen.split(' ').slice(0, 2).join(' ')];
      if (!found) throw new Error(`no eval for ${fen}`);
      return found;
    }),
    dispose: async () => {},
  };
}

function fakeLlm(response: unknown, fail = false): LlmProvider & { generate: ReturnType<typeof vi.fn> } {
  const generate = vi.fn(async (): Promise<LlmResult> => {
    if (fail) throw new Error('boom');
    return {
      text: JSON.stringify(response),
      model: 'test-model',
      provider: 'gemini',
      usage: { inputTokens: 10, outputTokens: 5 },
    };
  });
  return { name: 'gemini', generate } as unknown as LlmProvider & {
    generate: ReturnType<typeof vi.fn>;
  };
}

function fakeDb(drills: Array<Record<string, unknown>>, puzzles: Array<Record<string, unknown>>) {
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  const db = {
    drill: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        drills.filter((d) => where.id.in.includes(d.id as string) && !d.explanation),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push({ id: where.id, data });
        const d = drills.find((x) => x.id === where.id)!;
        Object.assign(d, data);
        return d;
      },
    },
    puzzle: {
      findMany: async ({ where }: { where: { externalId: { in: string[] } } }) =>
        puzzles.filter((p) => where.externalId.in.includes(p.externalId as string)),
    },
  };
  return { db: db as unknown as PrismaClient, updates };
}

const OPTS = {
  depth: 20,
  multiPv: 3,
  maxPvPlies: 6,
  maxDrills: 12,
  ...DEFAULT_DRILL_EXPLAIN_LLM_OPTIONS,
};

function drillRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    fen: PUZZLE_FEN,
    sideToMove: 'white',
    solutionUci: 'a1a8',
    solutionLine: 'a1a8',
    puzzleId: 'pz1',
    ...overrides,
  };
}

function puzzleRow(overrides: Record<string, unknown> = {}) {
  return { externalId: 'pz1', fen: PUZZLE_SOURCE_FEN, line: 'g7g6 a1a8', ...overrides };
}

describe('explainPuzzleDrills', () => {
  it('persists grounded LLM prose, variations, and the eval swing', async () => {
    const drill = drillRow();
    const { db, updates } = fakeDb([drill], [puzzleRow()]);
    const llm = fakeLlm({
      explanations: [
        {
          id: 'puzzle:d1',
          whatWentWrong: 'plain words about the mistake, no moves named',
          whyBetter: 'plain words about the solution',
          takeaway: 'a transferable habit',
        },
      ],
    });
    const result = await explainPuzzleDrills(db, ['d1'], fakeEngine(engineEvals()), llm, OPTS);
    expect(result.explained).toBe(1);
    expect(result.usage.outputTokens).toBe(5);
    const data = updates[0]!.data;
    expect((data.explanation as { source: string }).source).toBe('llm');
    expect(data.cpBefore).toBe(500);
    expect(data.cpAfter).toBe(900); // -900 opponent-POV → flipped to solver-POV
    const variations = data.variations as Array<{ kind: string; sans: string[]; cp?: number }>;
    expect(variations.some((v) => v.kind === 'best' && v.sans[0] === 'Ra8+')).toBe(true);
    expect(variations.some((v) => v.kind === 'alternative' && v.sans[0] === 'Ra2')).toBe(true);
  });

  it('falls back to template prose when the LLM output is ungrounded', async () => {
    const drill = drillRow();
    const { db, updates } = fakeDb([drill], [puzzleRow()]);
    const llm = fakeLlm({
      explanations: [
        {
          id: 'puzzle:d1',
          whatWentWrong: 'the invented move Qxf7 loses everything here',
          whyBetter: 'the solution is best',
          takeaway: 'stay alert',
        },
      ],
    });
    const result = await explainPuzzleDrills(db, ['d1'], fakeEngine(engineEvals()), llm, OPTS);
    expect(result.explained).toBe(1);
    const explanation = updates[0]!.data.explanation as { source: string; whatWentWrong: string };
    expect(explanation.source).toBe('template');
    expect(explanation.whatWentWrong).toContain('g6');
  });

  it('survives an LLM failure and still persists the engine-grounded template', async () => {
    const drill = drillRow();
    const { db, updates } = fakeDb([drill], [puzzleRow()]);
    const llm = fakeLlm(null, true);
    const result = await explainPuzzleDrills(db, ['d1'], fakeEngine(engineEvals()), llm, OPTS);
    expect(result.explained).toBe(1);
    expect((updates[0]!.data.explanation as { source: string }).source).toBe('template');
  });

  it('survives a drill with an eval-failing position without touching the rest', async () => {
    const good = drillRow({ id: 'd2' });
    const bad = drillRow({ id: 'd1', fen: 'not a fen' });
    const { db, updates } = fakeDb([bad, good], [puzzleRow()]);
    const llm = fakeLlm({
      explanations: [
        {
          id: 'puzzle:d2',
          whatWentWrong: 'plain words',
          whyBetter: 'plain words',
          takeaway: 'a habit',
        },
      ],
    });
    const result = await explainPuzzleDrills(db, ['d1', 'd2'], fakeEngine(engineEvals()), llm, OPTS);
    expect(result.explained).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.id).toBe('d2');
  });

  it('skips drills without a source puzzle row', async () => {
    const { db, updates } = fakeDb([drillRow({ puzzleId: 'missing' })], []);
    const result = await explainPuzzleDrills(db, ['d1'], fakeEngine(engineEvals()), fakeLlm(null), OPTS);
    expect(result.explained).toBe(0);
    expect(updates).toHaveLength(0);
  });
});
