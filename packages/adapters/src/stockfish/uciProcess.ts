import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import type { EngineEval, EngineEvaluateOptions } from '@chess-coach/core';

/** Upper bound for a single position evaluation. Depth-12 finishes in well
 * under a second; this only trips when the engine has genuinely wedged. */
const EVAL_TIMEOUT_MS = 30_000;

/**
 * A single Stockfish process speaking UCI. Serializes one evaluate at a time.
 * Score is reported from the side-to-move perspective (matches cpFromEval).
 */
export class UciProcess {
  private proc: ChildProcessWithoutNullStreams;
  private rl: Interface;
  private ready: Promise<void>;
  private busy = false;
  /** Set once the process exits; used to fail in-flight and future evaluates. */
  private exited: Error | null = null;
  /** Reject hook for whatever operation is currently awaiting engine output. */
  private rejectPending: ((err: Error) => void) | null = null;
  /** True once dispose() is called, so the resulting exit isn't flagged a crash. */
  private disposing = false;

  constructor(binPath: string) {
    this.proc = spawn(binPath, [], { stdio: 'pipe' });
    this.rl = createInterface({ input: this.proc.stdout });
    // A crashed/killed Stockfish (e.g. OOM) otherwise stops emitting lines with
    // no 'error' event, leaving evaluate() hung forever. Capture the exit and
    // reject any pending operation so the job fails loudly instead of stalling.
    this.proc.on('exit', (code, signal) => {
      if (this.disposing) return;
      this.exited = new Error(`stockfish exited unexpectedly (code=${code}, signal=${signal})`);
      this.rejectPending?.(this.exited);
      this.rejectPending = null;
    });
    this.ready = this.handshake();
  }

  private send(cmd: string): void {
    this.proc.stdin.write(`${cmd}\n`);
  }

  private handshake(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.exited) return reject(this.exited);
      this.rejectPending = reject;
      const onErr = (e: Error): void => reject(e);
      this.proc.once('error', onErr);
      const onLine = (line: string): void => {
        if (line.trim() === 'uciok') {
          this.rl.off('line', onLine);
          this.proc.off('error', onErr);
          this.rejectPending = null;
          // Pin determinism: single thread + fixed hash, standard chess only.
          // With fixed depth this yields identical results across runs/machines.
          this.send('setoption name Threads value 1');
          this.send('setoption name Hash value 16');
          this.send('setoption name UCI_Chess960 value false');
          resolve();
        }
      };
      this.rl.on('line', onLine);
      this.send('uci');
    });
  }

  async evaluate(fen: string, opts: EngineEvaluateOptions): Promise<EngineEval> {
    if (this.busy) throw new Error('UciProcess is busy');
    if (this.exited) throw this.exited;
    this.busy = true;
    try {
      await this.ready;
      await this.isReady();
      return await this.runGo(fen, opts);
    } finally {
      this.busy = false;
    }
  }

  get isBusy(): boolean {
    return this.busy;
  }

  private isReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.exited) return reject(this.exited);
      this.rejectPending = reject;
      const onLine = (line: string): void => {
        if (line.trim() === 'readyok') {
          this.rl.off('line', onLine);
          this.rejectPending = null;
          resolve();
        }
      };
      this.rl.on('line', onLine);
      this.send('isready');
    });
  }

  private runGo(fen: string, opts: EngineEvaluateOptions): Promise<EngineEval> {
    return new Promise((resolve, reject) => {
      if (this.exited) return reject(this.exited);
      let cp: number | undefined;
      let mate: number | undefined;
      let pv: string[] = [];
      let depth = 0;

      // Guard against a wedged (but not crashed) engine: without this a process
      // that stops emitting `bestmove` would hang the whole job indefinitely.
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`stockfish timed out after ${EVAL_TIMEOUT_MS}ms`));
      }, EVAL_TIMEOUT_MS);
      const cleanup = (): void => {
        clearTimeout(timer);
        this.rl.off('line', onLine);
        this.proc.off('error', onErr);
        this.rejectPending = null;
      };
      const onErr = (err: Error): void => {
        cleanup();
        reject(err);
      };
      this.rejectPending = (err: Error): void => {
        cleanup();
        reject(err);
      };
      const onLine = (line: string): void => {
        if (line.startsWith('info')) {
          const parsed = parseInfo(line);
          if (parsed) {
            ({ cp, mate } = pickScore(parsed, cp, mate));
            if (parsed.pv) pv = parsed.pv;
            if (parsed.depth) depth = parsed.depth;
          }
        } else if (line.startsWith('bestmove')) {
          cleanup();
          const best = line.split(/\s+/)[1] ?? pv[0] ?? '(none)';
          resolve({ cp, mate, bestMove: best, pv: pv.length ? pv : [best], depth });
        }
      };
      this.rl.on('line', onLine);
      this.proc.once('error', onErr);

      // Reset the transposition table before each position so the result is
      // independent of the order the pool happened to feed positions in.
      this.send('ucinewgame');
      this.send(`position fen ${fen}`);
      // Prefer fixed depth (deterministic). movetime is a non-deterministic
      // opt-in kept for callers that explicitly want a time budget.
      if (opts.depth) this.send(`go depth ${opts.depth}`);
      else this.send(`go movetime ${opts.movetimeMs ?? 150}`);
    });
  }

  async dispose(): Promise<void> {
    this.disposing = true; // expected exit — don't treat as a crash
    try {
      this.send('quit');
    } catch {
      /* already gone */
    }
    this.rl.close();
    this.proc.kill();
  }
}

interface InfoLine {
  cp?: number;
  mate?: number;
  pv?: string[];
  depth?: number;
  bound?: boolean;
}

function parseInfo(line: string): InfoLine | null {
  const tokens = line.split(/\s+/);
  const info: InfoLine = {};
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'depth') info.depth = Number(tokens[i + 1]);
    else if (t === 'score') {
      const kind = tokens[i + 1];
      const val = Number(tokens[i + 2]);
      if (kind === 'cp') info.cp = val;
      else if (kind === 'mate') info.mate = val;
      if (tokens[i + 3] === 'lowerbound' || tokens[i + 3] === 'upperbound') info.bound = true;
    } else if (t === 'pv') {
      info.pv = tokens.slice(i + 1);
      break;
    }
  }
  return info.cp !== undefined || info.mate !== undefined || info.pv ? info : null;
}

/** Prefer non-bound scores; keep the latest complete score seen. */
function pickScore(
  info: InfoLine,
  prevCp: number | undefined,
  prevMate: number | undefined,
): { cp: number | undefined; mate: number | undefined } {
  if (info.bound) return { cp: prevCp, mate: prevMate };
  if (info.mate !== undefined) return { cp: undefined, mate: info.mate };
  if (info.cp !== undefined) return { cp: info.cp, mate: undefined };
  return { cp: prevCp, mate: prevMate };
}
