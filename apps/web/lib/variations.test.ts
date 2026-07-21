import { describe, it, expect } from 'vitest';
import { expandVariation } from './variations.js';

const HANGING = 'r1bqkb1r/pppp1ppp/2n2n2/3N4/8/5P2/PPPPP1PP/R1BQKBNR w KQkq - 0 5';

describe('expandVariation', () => {
  it('returns one more position than moves, so the final position is visible', () => {
    const out = expandVariation(HANGING, ['f4', 'Nxd5']);
    expect(out.sans).toEqual(['f4', 'Nxd5']);
    expect(out.fens).toHaveLength(3);
    expect(out.fens[0]).toBe(HANGING);
  });

  it('derives UCI for arrows, including promotions', () => {
    expect(expandVariation(HANGING, ['f4']).ucis).toEqual(['f3f4']);
    const promo = expandVariation('8/P6k/8/8/8/8/8/7K w - - 0 1', ['a8=Q']);
    expect(promo.ucis).toEqual(['a7a8q']);
  });

  it('truncates at the first move that does not apply', () => {
    // A stored line could be stale relative to the position it claims to start from.
    const out = expandVariation(HANGING, ['f4', 'Qxh8', 'Nxd5']);
    expect(out.sans).toEqual(['f4']);
    expect(out.fens).toHaveLength(2);
  });

  it('handles an empty line', () => {
    const out = expandVariation(HANGING, []);
    expect(out).toEqual({ fens: [HANGING], sans: [], ucis: [] });
  });

  it('does not throw on an unparseable start position', () => {
    const out = expandVariation('not-a-fen', ['e4']);
    expect(out.sans).toEqual([]);
    expect(out.fens).toEqual(['not-a-fen']);
  });
});
