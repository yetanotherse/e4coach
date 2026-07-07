import type { ChessEngine, EngineEval, EngineEvaluateOptions } from '@chess-coach/core';
import { UciProcess } from './uciProcess.js';

export interface StockfishNativeOptions {
  binPath: string;
  /** number of parallel engine processes; defaults to 2 */
  poolSize?: number;
}

interface Waiter {
  fen: string;
  opts: EngineEvaluateOptions;
  resolve: (e: EngineEval) => void;
  reject: (err: unknown) => void;
}

/**
 * Pooled native Stockfish engine (spec §8.2, §11.1). Bounds concurrency to
 * `poolSize` processes and queues evaluate requests so a batch of games can't
 * spawn unbounded engines.
 */
export class StockfishNativeEngine implements ChessEngine {
  readonly name = 'native';
  private readonly pool: UciProcess[];
  private readonly idle: UciProcess[];
  private readonly queue: Waiter[] = [];
  private disposed = false;

  constructor(opts: StockfishNativeOptions) {
    const size = Math.max(1, opts.poolSize ?? 2);
    this.pool = Array.from({ length: size }, () => new UciProcess(opts.binPath));
    this.idle = [...this.pool];
  }

  evaluate(fen: string, opts: EngineEvaluateOptions): Promise<EngineEval> {
    if (this.disposed) return Promise.reject(new Error('engine disposed'));
    return new Promise((resolve, reject) => {
      this.queue.push({ fen, opts, resolve, reject });
      this.pump();
    });
  }

  private pump(): void {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const worker = this.idle.pop()!;
      const job = this.queue.shift()!;
      worker
        .evaluate(job.fen, job.opts)
        .then(job.resolve, job.reject)
        .finally(() => {
          if (!this.disposed) {
            this.idle.push(worker);
            this.pump();
          }
        });
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    for (const job of this.queue) job.reject(new Error('engine disposed'));
    this.queue.length = 0;
    await Promise.all(this.pool.map((p) => p.dispose()));
  }
}
