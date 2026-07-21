import { describe, it, expect } from 'vitest';
import type { ExplanationFacts } from '../analysis/explain.js';
import {
  buildExplainMessages,
  collectGroundedExplanations,
  LlmExplainSchema,
  validateGrounding,
  type LlmExplainItem,
} from './explain.js';

function makeFacts(overrides: Partial<ExplanationFacts> = {}): ExplanationFacts {
  return {
    id: 'g1:8',
    fenBefore: 'r1bqkb1r/pppp1ppp/2n2n2/3N4/8/5P2/PPPPP1PP/R1BQKBNR w KQkq - 0 5',
    userColor: 'white',
    playedSan: 'f4',
    bestSan: 'Nc3',
    variations: [
      { kind: 'refutation', label: 'You played f4', startFen: 'x', sans: ['f4', 'Nxd5'] },
      { kind: 'best', label: 'Better: Nc3', startFen: 'x', sans: ['Nc3'] },
    ],
    hangs: { square: 'd5', piece: 'knight', valuePawns: 3 },
    refutationMotifs: ['capture'],
    bestMoveRole: 'escape',
    materialSwingPawns: -3,
    allowedMoves: ['f4', 'Nxd5', 'Nc3'],
    ...overrides,
  };
}

function makeItem(overrides: Partial<LlmExplainItem> = {}): LlmExplainItem {
  return {
    id: 'g1:8',
    whatWentWrong: 'After f4, your opponent plays Nxd5 and wins the knight.',
    whyBetter: 'Nc3 saves the knight.',
    takeaway: 'Check what is defended before you move.',
    ...overrides,
  };
}

describe('buildExplainMessages', () => {
  it('sends the allowed moves and the engine lines, but never the raw FEN', () => {
    const [, user] = buildExplainMessages([makeFacts()]);
    expect(user!.content).toContain('allowedMoves');
    expect(user!.content).toContain('f4 Nxd5');
    // Positions come from the profile, never the model — no need to send them.
    expect(user!.content).not.toContain('r1bqkb1r');
  });

  it('instructs the model that it may only use the supplied moves', () => {
    const [system] = buildExplainMessages([makeFacts()]);
    expect(system!.content).toContain('allowedMoves');
    expect(system!.content).toContain('NEVER invent moves');
  });

  it('batches multiple mistakes into one call', () => {
    const [, user] = buildExplainMessages([makeFacts(), makeFacts({ id: 'g1:9' })]);
    expect(user!.content).toContain('g1:8');
    expect(user!.content).toContain('g1:9');
  });
});

describe('LlmExplainSchema', () => {
  it('accepts a well-formed response', () => {
    expect(LlmExplainSchema.safeParse({ explanations: [makeItem()] }).success).toBe(true);
  });

  it('rejects missing fields and empty strings', () => {
    expect(LlmExplainSchema.safeParse({ explanations: [{ id: 'g1:8' }] }).success).toBe(false);
    expect(
      LlmExplainSchema.safeParse({ explanations: [makeItem({ takeaway: '' })] }).success,
    ).toBe(false);
  });

  it('rejects an empty batch', () => {
    expect(LlmExplainSchema.safeParse({ explanations: [] }).success).toBe(false);
  });
});

describe('validateGrounding', () => {
  it('accepts prose that only cites supplied moves', () => {
    expect(validateGrounding(makeItem(), makeFacts())).toBe(true);
  });

  it('rejects a hallucinated move that the schema would happily accept', () => {
    // Fluent, confident, and completely made up — this is exactly the failure
    // mode zod cannot catch.
    const item = makeItem({
      whatWentWrong: 'After f4, your opponent plays Qxb7 and wins the rook.',
    });
    expect(LlmExplainSchema.safeParse({ explanations: [item] }).success).toBe(true);
    expect(validateGrounding(item, makeFacts())).toBe(false);
  });

  it('rejects a hallucination in any of the three fields', () => {
    expect(validateGrounding(makeItem({ whyBetter: 'Instead Bb5 was fine.' }), makeFacts())).toBe(
      false,
    );
    expect(validateGrounding(makeItem({ takeaway: 'Always consider e5 here.' }), makeFacts())).toBe(
      false,
    );
  });

  it('tolerates check and mate markers being added or dropped', () => {
    const facts = makeFacts({ allowedMoves: ['f4', 'Nxd5+', 'Nc3'] });
    expect(validateGrounding(makeItem({ whyBetter: 'Nxd5 comes with check.' }), facts)).toBe(true);

    const noSuffix = makeFacts({ allowedMoves: ['f4', 'Nxd5', 'Nc3'] });
    expect(validateGrounding(makeItem({ whyBetter: 'Then Nxd5+ follows.' }), noSuffix)).toBe(true);
  });

  it('accepts castling notation when it is an allowed move', () => {
    const facts = makeFacts({ allowedMoves: ['f4', 'O-O', 'O-O-O'] });
    const castling = (text: string): LlmExplainItem =>
      makeItem({ whatWentWrong: 'You left the king in the centre.', whyBetter: text });
    expect(validateGrounding(castling('O-O tucks the king away.'), facts)).toBe(true);
    expect(validateGrounding(castling('O-O-O is safer.'), facts)).toBe(true);
    // Queenside castling is not offered here, so citing it is a hallucination.
    const kingsideOnly = makeFacts({ allowedMoves: ['f4', 'O-O'] });
    expect(validateGrounding(castling('O-O-O is safer.'), kingsideOnly)).toBe(false);
  });

  it('accepts squares named in prose, not just moves', () => {
    // Regression: prose naturally says "your knight on d5", and the facts we
    // send actively encourage it (youLeftHanging: "knight on d5"). Treating a
    // bare coordinate as an invented pawn move rejected most good narration.
    const facts = makeFacts();
    expect(
      validateGrounding(makeItem({ whatWentWrong: 'Your knight on d5 was left hanging.' }), facts),
    ).toBe(true);
    expect(
      validateGrounding(makeItem({ takeaway: 'Keep an eye on loose pieces like the one on d5.' }), facts),
    ).toBe(true);
  });

  it('still rejects a square that appears in none of the engine lines', () => {
    // h7 is not a destination of any allowed move, so this is invented detail.
    expect(
      validateGrounding(makeItem({ whyBetter: 'It also covers h7 nicely.' }), makeFacts()),
    ).toBe(false);
  });

  it('does not trip over ordinary prose containing no moves', () => {
    const item = makeItem({
      whatWentWrong: 'Your opponent simply took the loose piece.',
      whyBetter: 'The engine wanted to keep everything defended.',
      takeaway: 'Ask what is hanging before you commit.',
    });
    expect(validateGrounding(item, makeFacts())).toBe(true);
  });
});

describe('collectGroundedExplanations', () => {
  const factsById = new Map([['g1:8', makeFacts()]]);

  it('returns validated, grounded items keyed by id', () => {
    const out = collectGroundedExplanations({ explanations: [makeItem()] }, factsById);
    expect(out.get('g1:8')?.whyBetter).toBe('Nc3 saves the knight.');
  });

  it('drops an id we never asked about', () => {
    const out = collectGroundedExplanations(
      { explanations: [makeItem({ id: 'invented:1' })] },
      factsById,
    );
    expect(out.size).toBe(0);
  });

  it('drops only the ungrounded item, keeping the rest of the batch', () => {
    const facts = new Map([
      ['g1:8', makeFacts()],
      ['g1:9', makeFacts({ id: 'g1:9' })],
    ]);
    const out = collectGroundedExplanations(
      {
        explanations: [
          makeItem(),
          makeItem({ id: 'g1:9', whatWentWrong: 'Then Qh5xf7 crashes through.' }),
        ],
      },
      facts,
    );
    expect([...out.keys()]).toEqual(['g1:8']);
  });

  it('returns nothing for malformed output rather than throwing', () => {
    expect(collectGroundedExplanations({ nope: true }, factsById).size).toBe(0);
    expect(collectGroundedExplanations(undefined, factsById).size).toBe(0);
    expect(collectGroundedExplanations('a string', factsById).size).toBe(0);
  });
});
