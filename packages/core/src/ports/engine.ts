/** ChessEngine port (spec §8.2). */
import type { EngineEval } from '../types.js';

export interface EngineEvaluateOptions {
  depth?: number;
  movetimeMs?: number;
  /**
   * Number of principal variations to return (UCI MultiPV). Defaults to 1.
   * When > 1 the result carries `lines` with the top-N moves, used by the deep
   * analysis pass to offer alternative good moves. Note MultiPV alters the
   * search tree, so evals taken at multiPv > 1 are NOT comparable to single-PV
   * evals of the same position — never mix them into CPL scoring.
   */
  multiPv?: number;
}

export interface ChessEngine {
  readonly name: string;
  evaluate(fen: string, opts: EngineEvaluateOptions): Promise<EngineEval>;
  dispose(): Promise<void>;
}
