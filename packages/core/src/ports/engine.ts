/** ChessEngine port (spec §8.2). */
import type { EngineEval } from '../types.js';

export interface EngineEvaluateOptions {
  depth?: number;
  movetimeMs?: number;
}

export interface ChessEngine {
  readonly name: string;
  evaluate(fen: string, opts: EngineEvaluateOptions): Promise<EngineEval>;
  dispose(): Promise<void>;
}
