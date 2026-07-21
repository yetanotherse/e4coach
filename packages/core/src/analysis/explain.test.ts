import { describe, it, expect } from 'vitest';
import {
  deriveExplanationFacts,
  materialBalance,
  renderExplanation,
  replayUci,
  type DeriveInput,
} from './explain.js';

/** White knight on d5 is undefended; no white pawn can recapture there. */
const HANGING = 'r1bqkb1r/pppp1ppp/2n2n2/3N4/8/5P2/PPPPP1PP/R1BQKBNR w KQkq - 0 5';
/** Same shape, but a white e-pawn can recapture on d5 — a trade, not a loss. */
const TRADE = 'r1bqkb1r/pppp1ppp/2n2n2/3Np3/4P3/8/PPPP1PPP/R1BQKBNR w KQkq - 0 5';
/** Black knight on b4 can land on c2, forking the white king and a1 rook. */
const FORKABLE = 'r3k2r/pppp1ppp/8/8/1n6/8/PPPP1PPP/R3K2R w KQkq - 0 1';
/** Black to move; stepping the king to h8 walks into back-rank mate by Ra8#. */
const BACK_RANK = '6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 1';
/** White is exactly a rook up — a clean fixture for balance arithmetic. */
const ROOK_UP = '4k3/8/8/8/8/8/8/R3K3 w - - 0 1';

const base: DeriveInput = {
  id: 'g1:14',
  fenBefore: HANGING,
  userColor: 'white',
  playedUci: 'f3f4',
  playedSan: 'f4',
};

describe('replayUci', () => {
  it('converts a UCI line to SAN', () => {
    expect(replayUci(HANGING, ['f3f4', 'f6d5']).sans).toEqual(['f4', 'Nxd5']);
  });

  it('truncates at the first illegal move instead of throwing', () => {
    // Engine PV tails can be stale when the search is cut mid-iteration.
    const { sans } = replayUci(HANGING, ['f3f4', 'a1a8', 'f6d5']);
    expect(sans).toEqual(['f4']);
  });

  it('respects maxPlies', () => {
    expect(replayUci(HANGING, ['f3f4', 'f6d5'], 1).sans).toEqual(['f4']);
  });

  it('returns the input fen unchanged for an empty line', () => {
    expect(replayUci(HANGING, [])).toEqual({ sans: [], endFen: HANGING });
  });

  it('does not throw on a malformed fen or malformed uci', () => {
    expect(replayUci('not-a-fen', ['e2e4']).sans).toEqual([]);
    expect(replayUci(HANGING, ['e2']).sans).toEqual([]);
  });
});

describe('materialBalance', () => {
  it('is zero from either side in the start position', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(materialBalance(start, 'white')).toBe(0);
    expect(materialBalance(start, 'black')).toBe(0);
  });

  it('is signed from the given side’s perspective', () => {
    expect(materialBalance(ROOK_UP, 'white')).toBe(5);
    expect(materialBalance(ROOK_UP, 'black')).toBe(-5);
  });

  it('returns 0 for an unparseable fen rather than throwing', () => {
    expect(materialBalance('garbage', 'white')).toBe(0);
  });
});

describe('deriveExplanationFacts', () => {
  it('identifies a piece left hanging and prices the loss', () => {
    const f = deriveExplanationFacts({
      ...base,
      refutationPv: ['f6d5'],
      bestUci: 'd5c3',
      bestPv: ['d5c3'],
    });
    expect(f.hangs).toEqual({ square: 'd5', piece: 'knight', valuePawns: 3 });
    expect(f.refutationMotifs).toContain('capture');
    expect(f.materialSwingPawns).toBe(-3);
    expect(f.bestSan).toBe('Nc3');
    // Moving the attacked piece is the clearest lesson available.
    expect(f.bestMoveRole).toBe('escape');
  });

  it('shows the refutation starting from the played move, so the mistake is visible', () => {
    const f = deriveExplanationFacts({ ...base, refutationPv: ['f6d5'] });
    const refutation = f.variations.find((v) => v.kind === 'refutation');
    expect(refutation?.startFen).toBe(HANGING);
    expect(refutation?.sans).toEqual(['f4', 'Nxd5']);
    expect(refutation?.label).toBe('You played f4');
  });

  it('nets out a recapture rather than reporting the first capture as a loss', () => {
    // Nxd5 wins a knight but exd5 takes it straight back — swing is ~0.
    const f = deriveExplanationFacts({
      id: 'g1:9',
      fenBefore: TRADE,
      userColor: 'white',
      playedUci: 'a2a3',
      playedSan: 'a3',
      refutationPv: ['f6d5', 'e4d5'],
    });
    expect(f.materialSwingPawns).toBe(0);
  });

  it('detects a fork, the check that comes with it, and the captured pawn', () => {
    const f = deriveExplanationFacts({
      id: 'g2:20',
      fenBefore: FORKABLE,
      userColor: 'white',
      playedUci: 'a2a3',
      playedSan: 'a3',
      refutationPv: ['b4c2'],
    });
    expect(f.refutationMotifs).toEqual(expect.arrayContaining(['fork', 'check', 'capture']));
    expect(f.hangs?.square).toBe('c2');
  });

  it('detects mate in the refutation', () => {
    const f = deriveExplanationFacts({
      id: 'g3:41',
      fenBefore: BACK_RANK,
      userColor: 'black',
      playedUci: 'g8h8',
      playedSan: 'Kh8',
      refutationPv: ['a1a8'],
    });
    expect(f.refutationMotifs).toContain('mate');
    // Mate is reported, not the check that delivers it.
    expect(f.refutationMotifs).not.toContain('check');
  });

  it('collects alternatives from MultiPV, skipping duplicates of the best or played move', () => {
    const f = deriveExplanationFacts({
      ...base,
      bestPv: ['d5c3'],
      alternativePvs: [['d5c3'], ['d5e3'], ['f3f4']],
    });
    const alts = f.variations.filter((v) => v.kind === 'alternative');
    expect(alts).toHaveLength(1);
    expect(alts[0]!.sans[0]).toBe('Ne3');
  });

  it('lists every mentioned move in allowedMoves, and nothing else', () => {
    const f = deriveExplanationFacts({
      ...base,
      refutationPv: ['f6d5'],
      bestPv: ['d5c3'],
    });
    expect(f.allowedMoves).toEqual(expect.arrayContaining(['f4', 'Nxd5', 'Nc3']));
    // No move appears twice, and nothing is invented.
    expect(new Set(f.allowedMoves).size).toBe(f.allowedMoves.length);
    for (const san of f.allowedMoves) {
      expect(['f4', 'Nxd5', 'Nc3']).toContain(san);
    }
  });

  it('degrades to a quiet role and empty motifs when the engine gave no lines', () => {
    const f = deriveExplanationFacts(base);
    expect(f.variations).toHaveLength(0);
    expect(f.refutationMotifs).toEqual([]);
    expect(f.bestMoveRole).toBe('quiet');
    expect(f.materialSwingPawns).toBe(0);
  });

  it('survives an illegal refutation move without losing the rest of the facts', () => {
    const f = deriveExplanationFacts({
      ...base,
      refutationPv: ['h8h1'], // not legal here
      bestPv: ['d5c3'],
    });
    expect(f.bestSan).toBe('Nc3');
    expect(f.refutationMotifs).toEqual([]);
  });

  it('classifies a capture as the best-move role when nothing is hanging', () => {
    const f = deriveExplanationFacts({
      id: 'g4:12',
      fenBefore: TRADE,
      userColor: 'white',
      playedUci: 'a2a3',
      playedSan: 'a3',
      bestPv: ['d5f6'], // Nxf6+, a capture
    });
    expect(f.bestSan).toBe('Nxf6+');
    expect(f.bestMoveRole).toBe('capture');
  });
});

describe('renderExplanation', () => {
  it('names the punishing move, the piece lost, and where it stood', () => {
    const f = deriveExplanationFacts({
      ...base,
      refutationPv: ['f6d5'],
      bestPv: ['d5c3'],
    });
    const out = renderExplanation(f);
    expect(out.whatWentWrong).toContain('Nxd5');
    expect(out.whatWentWrong).toContain('knight');
    expect(out.whatWentWrong).toContain('d5');
    // The old report said only "The engine preferred Nc3." — this must do more.
    expect(out.whatWentWrong.length).toBeGreaterThan(40);
  });

  it('explains what the better move accomplishes rather than just naming it', () => {
    const f = deriveExplanationFacts({ ...base, refutationPv: ['f6d5'], bestPv: ['d5c3'] });
    const out = renderExplanation(f);
    expect(out.whyBetter).toContain('Nc3');
    expect(out.whyBetter).toContain('out of danger');
  });

  it('calls out a fork explicitly', () => {
    const f = deriveExplanationFacts({
      id: 'g2:20',
      fenBefore: FORKABLE,
      userColor: 'white',
      playedUci: 'a2a3',
      playedSan: 'a3',
      refutationPv: ['b4c2'],
    });
    expect(renderExplanation(f).whatWentWrong).toContain('two things at once');
  });

  it('teaches the fork, not the loose pawn, when a fork opens with a capture', () => {
    const f = deriveExplanationFacts({
      id: 'g2:21',
      fenBefore: FORKABLE,
      userColor: 'white',
      playedUci: 'a2a3',
      playedSan: 'a3',
      refutationPv: ['b4c2', 'e1d1', 'c2a1'],
    });
    const out = renderExplanation(f);
    expect(out.takeaway).toContain('two of yours at once');
    expect(out.takeaway).not.toContain('left loose');
  });

  it('quotes the line’s total cost only when it exceeds the first capture', () => {
    const fork = deriveExplanationFacts({
      id: 'g2:22',
      fenBefore: FORKABLE,
      userColor: 'white',
      playedUci: 'a2a3',
      playedSan: 'a3',
      refutationPv: ['b4c2', 'e1d1', 'c2a1'], // pawn now, rook later
    });
    // Attributing the full 6 pawns to "winning your pawn on c2" would read as a
    // contradiction, so the total is stated as a separate consequence.
    expect(renderExplanation(fork).whatWentWrong).toContain('down about 6 pawns');

    const simple = deriveExplanationFacts({
      ...base,
      refutationPv: ['f6d5'], // knight for knight, nothing further
    });
    expect(renderExplanation(simple).whatWentWrong).not.toContain('down about');
  });

  it('never claims the user is “down” material when the swing is in their favour', () => {
    // An opponent sacrifice (very common in the attacking lines this feature
    // exists to explain) can leave the user materially AHEAD at the point the
    // variation is truncated. Reporting that as a loss would be flatly wrong.
    const sacrifice = deriveExplanationFacts({
      ...base,
      refutationPv: ['f6d5'],
    });
    const upMaterial = { ...sacrifice, materialSwingPawns: 5, hangs: undefined };
    expect(renderExplanation(upMaterial).whatWentWrong).not.toContain('down about');
  });

  it('gives a mate-specific takeaway', () => {
    const f = deriveExplanationFacts({
      id: 'g3:42',
      fenBefore: BACK_RANK,
      userColor: 'black',
      playedUci: 'g8h8',
      playedSan: 'Kh8',
      refutationPv: ['a1a8'],
    });
    const out = renderExplanation(f);
    expect(out.whatWentWrong).toContain('mate');
    expect(out.takeaway).toContain('escape squares');
  });

  it('ties the takeaway to the loose piece when one was hanging', () => {
    const f = deriveExplanationFacts({ ...base, refutationPv: ['f6d5'], bestPv: ['d5c3'] });
    expect(renderExplanation(f).takeaway).toContain('knight on d5');
  });

  it('mentions alternative moves when the engine offered them', () => {
    const f = deriveExplanationFacts({
      ...base,
      refutationPv: ['f6d5'],
      bestPv: ['d5c3'],
      alternativePvs: [['d5e3']],
    });
    expect(renderExplanation(f).whyBetter).toContain('Ne3');
  });

  it('produces usable prose even with no engine lines at all', () => {
    const out = renderExplanation(deriveExplanationFacts(base));
    expect(out.whatWentWrong).toContain('f4');
    expect(out.whyBetter).toBe('');
    expect(out.takeaway.length).toBeGreaterThan(0);
  });
});
