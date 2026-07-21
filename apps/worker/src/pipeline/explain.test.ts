import { describe, it, expect, vi } from 'vitest';
import type {
  ErrorInstance,
  ExplanationFacts,
  LlmProvider,
  LlmResult,
  WeaknessProfile,
} from '@chess-coach/core';
import type { Enrichment } from './deepen.js';
import { chunk, narrateExplanations } from './explain.js';

function makeFacts(id: string): ExplanationFacts {
  return {
    id,
    fenBefore: 'r1bqkb1r/pppp1ppp/2n2n2/3N4/8/5P2/PPPPP1PP/R1BQKBNR w KQkq - 0 5',
    userColor: 'white',
    playedSan: 'f4',
    bestSan: 'Nc3',
    variations: [
      { kind: 'refutation', label: 'You played f4', startFen: 'x', sans: ['f4', 'Nxd5'] },
    ],
    hangs: { square: 'd5', piece: 'knight', valuePawns: 3 },
    refutationMotifs: ['capture'],
    bestMoveRole: 'escape',
    materialSwingPawns: -3,
    allowedMoves: ['f4', 'Nxd5', 'Nc3'],
  };
}

const templateExplanation = {
  whatWentWrong: 'deterministic what',
  whyBetter: 'deterministic why',
  takeaway: 'deterministic takeaway',
  source: 'template' as const,
};

function makeEnrichment(): Enrichment {
  return {
    explanation: templateExplanation,
    variations: [{ kind: 'refutation', label: 'You played f4', startFen: 'x', sans: ['f4', 'Nxd5'] }],
  };
}

function makeExample(ply: number): ErrorInstance {
  return {
    category: 'HANGING_PIECE',
    gameId: 'g1',
    moveNumber: 5,
    ply,
    fen: 'x',
    playedMove: 'f4',
    betterMove: 'd5c3',
    cpl: 300,
    cpBefore: 100,
    cpAfter: -200,
    assessment: 'clearly better',
    userColor: 'white',
    note: 'The engine preferred Nc3.',
    explanation: templateExplanation,
  };
}

function makeProfile(plies: number[]): WeaknessProfile {
  return {
    username: 't',
    source: 'lichess',
    gamesAnalyzed: 1,
    movesScored: 10,
    topWeaknesses: ['HANGING_PIECE'],
    lowConfidence: false,
    engineMeta: { kind: 'mock', depth: 12 },
    categories: [
      {
        category: 'HANGING_PIECE',
        frequency: plies.length,
        estimatedRatingLoss: 40,
        examples: plies.map(makeExample),
      },
    ],
  } as unknown as WeaknessProfile;
}

function llmReturning(fn: (messages: unknown) => unknown, name = 'gemini'): LlmProvider {
  return {
    name,
    generate: vi.fn(async (messages): Promise<LlmResult> => {
      const parsed = fn(messages);
      if (parsed instanceof Error) throw parsed;
      return {
        text: JSON.stringify(parsed),
        parsed,
        usage: { inputTokens: 100, outputTokens: 50 },
        model: 'test',
        provider: name,
      };
    }),
  };
}

const goodItem = (id: string) => ({
  id,
  whatWentWrong: 'After f4 your opponent plays Nxd5 and wins a piece.',
  whyBetter: 'Nc3 moves it to safety.',
  takeaway: 'Check what is defended.',
});

describe('chunk', () => {
  it('splits into fixed-size batches with a short tail', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('handles empty input and degenerate sizes', () => {
    expect(chunk([], 3)).toEqual([]);
    expect(chunk([1, 2], 0)).toEqual([[1], [2]]);
  });
});

describe('narrateExplanations', () => {
  const facts = new Map([['g1:8', makeFacts('g1:8')]]);
  const enrichments = new Map([['g1:8', makeEnrichment()]]);

  it('replaces the deterministic prose with grounded model prose', async () => {
    const llm = llmReturning(() => ({ explanations: [goodItem('g1:8')] }));
    const out = await narrateExplanations(makeProfile([8]), facts, llm, enrichments);

    expect(out.narrated).toBe(1);
    const ex = out.profile.categories[0]!.examples[0]!;
    expect(ex.explanation?.source).toBe('llm');
    expect(ex.explanation?.whyBetter).toBe('Nc3 moves it to safety.');
  });

  it('keeps the engine variations even when the model rewrites the prose', async () => {
    const llm = llmReturning(() => ({ explanations: [goodItem('g1:8')] }));
    const out = await narrateExplanations(makeProfile([8]), facts, llm, enrichments);
    // Boards must always come from the engine, never the model.
    expect(out.profile.categories[0]!.examples[0]!.variations).toEqual([
      { kind: 'refutation', label: 'You played f4', startFen: 'x', sans: ['f4', 'Nxd5'] },
    ]);
  });

  it('keeps the deterministic text when the model hallucinates a move', async () => {
    const llm = llmReturning(() => ({
      explanations: [
        { ...goodItem('g1:8'), whatWentWrong: 'Your opponent crashes through with Qxh7.' },
      ],
    }));
    const out = await narrateExplanations(makeProfile([8]), facts, llm, enrichments);
    expect(out.narrated).toBe(0);
    expect(out.profile.categories[0]!.examples[0]!.explanation).toEqual(templateExplanation);
  });

  it('keeps the deterministic text when the call throws', async () => {
    const llm = llmReturning(() => new Error('502 bad gateway'));
    const out = await narrateExplanations(makeProfile([8]), facts, llm, enrichments);
    expect(out.narrated).toBe(0);
    expect(out.profile.categories[0]!.examples[0]!.explanation?.source).toBe('template');
  });

  it('keeps the deterministic text when output fails the schema', async () => {
    const llm = llmReturning(() => ({ explanations: [{ id: 'g1:8' }] }));
    const out = await narrateExplanations(makeProfile([8]), facts, llm, enrichments);
    expect(out.narrated).toBe(0);
  });

  it('degrades per batch, so one bad call does not lose the good ones', async () => {
    const many = new Map(
      [8, 9, 10, 11].map((ply) => [`g1:${ply}`, makeFacts(`g1:${ply}`)] as const),
    );
    const manyEnrichments = new Map(
      [8, 9, 10, 11].map((ply) => [`g1:${ply}`, makeEnrichment()] as const),
    );
    let call = 0;
    const llm = llmReturning((messages) => {
      call++;
      // Second batch fails entirely.
      if (call === 2) return new Error('rate limited');
      // Echo back an explanation for each id the prompt actually asked about.
      const ids = [...new Set(JSON.stringify(messages).match(/g1:\d+/g) ?? [])];
      return { explanations: ids.map(goodItem) };
    });

    const out = await narrateExplanations(
      makeProfile([8, 9, 10, 11]),
      many,
      llm,
      manyEnrichments,
      { batchSize: 2, concurrency: 1 },
    );

    // One batch of 2 succeeded, one failed.
    expect(out.narrated).toBe(2);
    const sources = out.profile.categories[0]!.examples.map((e) => e.explanation?.source);
    expect(sources.filter((s) => s === 'llm')).toHaveLength(2);
    expect(sources.filter((s) => s === 'template')).toHaveLength(2);
  });

  it('batches according to batchSize', async () => {
    const many = new Map(
      [8, 9, 10, 11, 12].map((ply) => [`g1:${ply}`, makeFacts(`g1:${ply}`)] as const),
    );
    const llm = llmReturning(() => ({ explanations: [] }));
    await narrateExplanations(makeProfile([8]), many, llm, new Map(), {
      batchSize: 2,
      concurrency: 1,
    });
    // 5 items at batchSize 2 → 3 calls.
    expect(llm.generate).toHaveBeenCalledTimes(3);
  });

  it('accumulates token usage for cost tracking', async () => {
    const many = new Map([8, 9].map((ply) => [`g1:${ply}`, makeFacts(`g1:${ply}`)] as const));
    const llm = llmReturning(() => ({ explanations: [] }));
    const out = await narrateExplanations(makeProfile([8]), many, llm, new Map(), {
      batchSize: 1,
      concurrency: 1,
    });
    expect(out.usage).toEqual({ inputTokens: 200, outputTokens: 100 });
  });

  it('does not call a mock provider', async () => {
    const llm = llmReturning(() => ({ explanations: [goodItem('g1:8')] }), 'mock');
    const out = await narrateExplanations(makeProfile([8]), facts, llm, enrichments);
    expect(llm.generate).not.toHaveBeenCalled();
    expect(out.narrated).toBe(0);
  });

  it('does nothing when there are no facts', async () => {
    const llm = llmReturning(() => ({ explanations: [] }));
    const out = await narrateExplanations(makeProfile([8]), new Map(), llm, new Map());
    expect(llm.generate).not.toHaveBeenCalled();
    expect(out.narrated).toBe(0);
  });
});
