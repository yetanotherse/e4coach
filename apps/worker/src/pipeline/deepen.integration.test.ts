/**
 * End-to-end check of the explanation stack against a REAL Stockfish binary:
 * MultiPV plumbing (uciProcess) → fact derivation (explain.ts) → deterministic
 * prose (deepen.ts). The unit tests use a fake engine, so this is what proves
 * the pieces actually fit together on a genuine search.
 *
 * Skipped when no Stockfish is installed.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { StockfishNativeEngine } from '@chess-coach/adapters';
import type { ErrorInstance, WeaknessProfile } from '@chess-coach/core';
import { deepenProfile } from './deepen.js';

function findStockfish(): string | null {
  const candidates = [
    process.env.STOCKFISH_PATH,
    '/opt/homebrew/bin/stockfish',
    '/usr/local/bin/stockfish',
    '/usr/games/stockfish',
    '/usr/bin/stockfish',
  ].filter(Boolean) as string[];
  return candidates.find((p) => existsSync(p)) ?? null;
}

const bin = findStockfish();

/** White's knight on d5 is loose; f4 ignores it and Black just takes it. */
const HANGING = 'r1bqkb1r/pppp1ppp/2n2n2/3N4/8/5P2/PPPPP1PP/R1BQKBNR w KQkq - 0 5';

const example: ErrorInstance = {
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
};

const profile = {
  username: 'tester',
  source: 'lichess',
  gamesAnalyzed: 1,
  movesScored: 10,
  topWeaknesses: ['HANGING_PIECE'],
  lowConfidence: false,
  engineMeta: { kind: 'native', depth: 12 },
  categories: [
    { category: 'HANGING_PIECE', frequency: 1, estimatedRatingLoss: 40, examples: [example] },
  ],
} as unknown as WeaknessProfile;

describe.skipIf(!bin)('deepenProfile (real Stockfish)', () => {
  it('turns a real blunder into an explanation grounded in real engine lines', async () => {
    const engine = new StockfishNativeEngine({ binPath: bin!, poolSize: 2 });
    try {
      const { profile: out, facts } = await deepenProfile(profile, engine, {
        depth: 16,
        multiPv: 3,
        maxPositions: 5,
        maxPvPlies: 6,
      });
      const ex = out.categories[0]!.examples[0]!;

      // The engine found the refutation on its own — we did not supply it.
      expect(ex.explanation!.whatWentWrong).toContain('Nxd5');
      expect(ex.explanation!.whatWentWrong).toContain('knight on d5');
      expect(ex.explanation!.source).toBe('template');
      expect(facts.get('g1:8')?.hangs).toMatchObject({ square: 'd5', piece: 'knight' });

      // The refutation is playable from the position before the mistake.
      const refutation = ex.variations!.find((v) => v.kind === 'refutation')!;
      expect(refutation.startFen).toBe(HANGING);
      expect(refutation.sans.slice(0, 2)).toEqual(['f4', 'Nxd5']);
      expect(refutation.cp).toBeLessThan(0); // user-POV: the line is bad for White

      // MultiPV produced genuine alternatives distinct from the engine's choice.
      const best = ex.variations!.find((v) => v.kind === 'best')!;
      const alternatives = ex.variations!.filter((v) => v.kind === 'alternative');
      expect(best.cp).toBeGreaterThan(0);
      expect(alternatives.length).toBeGreaterThan(0);
      for (const alt of alternatives) {
        expect(alt.sans[0]).not.toBe(best.sans[0]);
      }

      // Every move the prose may cite is a real move from a real line.
      const allowed = new Set(facts.get('g1:8')!.allowedMoves);
      for (const variation of ex.variations!) {
        for (const san of variation.sans) expect(allowed.has(san)).toBe(true);
      }
    } finally {
      await engine.dispose();
    }
  }, 120_000);
});
