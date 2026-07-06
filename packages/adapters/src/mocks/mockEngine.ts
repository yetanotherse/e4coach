import type { ChessEngine, EngineEval, EngineEvaluateOptions } from '@chess-coach/core';

/**
 * Deterministic engine stub. Produces a stable pseudo-eval derived from a hash
 * of the FEN so the pipeline is reproducible. NOT chess-accurate — real
 * classification quality is validated with the native engine in Phase C and
 * with hand-crafted ScoredMove fixtures in core's unit tests.
 */
export class MockEngine implements ChessEngine {
  readonly name = 'mock';

  async evaluate(fen: string, _opts: EngineEvaluateOptions): Promise<EngineEval> {
    const h = hash(fen);
    // Map hash to a bounded cp value in [-400, 400].
    const cp = (h % 801) - 400;
    return {
      cp,
      bestMove: 'e2e4',
      pv: ['e2e4'],
      depth: 12,
    };
  }

  async dispose(): Promise<void> {
    /* no-op */
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
