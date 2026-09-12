import { describe, it, expect } from 'vitest';
import { derivePuzzleExplanationFacts, renderPuzzleExplanation } from './puzzleExplain.js';

/**
 * A back-rank mate: the solver (white) plays Ra8#. The opponent's "setup"
 * move is g6 — whatever the story, the framing is: opponent's last move
 * created the chance, the solution punishes it.
 */
const PUZZLE_FEN = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';

function input(overrides: Partial<Parameters<typeof derivePuzzleExplanationFacts>[0]> = {}) {
  return {
    id: 'puzzle:z1',
    fen: PUZZLE_FEN,
    solverColor: 'white' as const,
    setupUci: 'g7g6',
    setupSan: 'g6',
    solutionLine: 'a1a8',
    cpBefore: 500,
    cpAfter: 1000,
    alternativePvs: [['a1a2'], ['a1a8']], // a2 works, the solution move itself is excluded
    ...overrides,
  };
}

describe('derivePuzzleExplanationFacts', () => {
  it('builds the solution as the best variation and keeps the puzzle framing', () => {
    const facts = derivePuzzleExplanationFacts(input())!;
    expect(facts).toBeTruthy();
    expect(facts.id).toBe('puzzle:z1');
    // The "played" move in puzzle framing is the OPPONENT'S setup move.
    expect(facts.playedSan).toBe('g6');
    expect(facts.userColor).toBe('white');
    expect(facts.bestSan).toBe('Ra8#');
    const best = facts.variations.find((v) => v.kind === 'best')!;
    expect(best.label).toContain('Solution:');
    expect(best.sans).toEqual(['Ra8#']);
    expect(best.cp).toBe(1000);
  });

  it('detects the capture/mate motifs of the solution move', () => {
    const facts = derivePuzzleExplanationFacts(input())!;
    // Ra8# is mate: motif set, no material captured.
    expect(facts.refutationMotifs).toContain('mate');
    expect(facts.hangs).toBeUndefined();
  });

  it('adds engine alternatives that are not the solution', () => {
    const facts = derivePuzzleExplanationFacts(input())!;
    const alts = facts.variations.filter((v) => v.kind === 'alternative');
    expect(alts.map((v) => v.sans[0])).toEqual(['Ra2']);
  });

  it('marks the captured piece when the solution takes material', () => {
    // Qd4? drops the queen to the rook... simpler: white to move, Ra1 can
    // capture on a8-free file; use a puzzle whose solution is a capture:
    // black queen on a5, white rook takes it.
    const facts = derivePuzzleExplanationFacts(
      input({
        fen: '6k1/5ppp/8/q7/8/8/5PPP/R5K1 w - - 0 1',
        setupSan: 'Qa5',
        setupUci: 'a6a5',
        solutionLine: 'a1a5',
        cpAfter: 800,
        alternativePvs: [],
      }),
    )!;
    expect(facts.hangs?.piece).toBe('queen');
    expect(facts.hangs?.valuePawns).toBe(9);
    expect(facts.refutationMotifs).toContain('capture');
    expect(facts.materialSwingPawns).toBe(9);
  });

  it('returns null when the solution line does not replay', () => {
    expect(derivePuzzleExplanationFacts(input({ solutionLine: 'x9x9' }))).toBeNull();
  });
});

describe('renderPuzzleExplanation', () => {
  it('writes solver-addressed prose from the derived facts (mate case)', () => {
    const facts = derivePuzzleExplanationFacts(input())!;
    const prose = renderPuzzleExplanation(facts);
    expect(prose.whatWentWrong).toContain('opponent');
    expect(prose.whatWentWrong).toContain('g6');
    expect(prose.whyBetter).toContain('Ra8#');
    expect(prose.takeaway.length).toBeGreaterThan(10);
  });

  it('names the capturable piece when the solution wins material', () => {
    const facts = derivePuzzleExplanationFacts(
      input({
        fen: '6k1/5ppp/8/q7/8/8/5PPP/R5K1 w - - 0 1',
        setupSan: 'Qa5',
        setupUci: 'a6a5',
        solutionLine: 'a1a5',
        cpAfter: 800,
        alternativePvs: [],
      }),
    )!;
    const prose = renderPuzzleExplanation(facts);
    expect(prose.whatWentWrong).toContain('queen');
    expect(prose.whatWentWrong).toContain('a5');
  });
});
