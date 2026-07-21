import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import type { EngineEval, EngineEvaluateOptions, EngineLine } from '@chess-coach/core';

/**
 * Upper bound for a single position evaluation, scaled to the work requested.
 * The old flat 30s was sized for depth-12 single-PV (well under a second in
 * practice). The deep analysis pass runs depth-20 with MultiPV 3, which is
 * 10-30x the work and can legitimately exceed a flat 30s on a slow box —
 * a hard timeout there would fail real evaluations, not wedged ones.
 */
export function evalTimeoutMs(opts: EngineEvaluateOptions): number {
  const base = 30_000;
  const depthFactor = opts.depth && opts.depth > 12 ? 2 ** ((opts.depth - 12) / 4) : 1;
  const multiPvFactor = Math.max(1, opts.multiPv ?? 1);
  return Math.min(300_000, Math.round(base * depthFactor * multiPvFactor));
}

/** Per-process UCI tuning. Threads>1 makes search non-deterministic. */
export interface UciOptions {
  /** UCI Threads (default 1 — deterministic). */
  threads?: number;
  /** UCI Hash in MB (default 16). */
  hash?: number;
}

/**
 * The `setoption` commands sent after `uciok`. Extracted (and pure) so the
 * Threads/Hash wiring can be unit-tested without spawning Stockfish.
 * UCI_Chess960 is pinned off — we only analyze standard chess.
 */
export function engineSetOptions(threads: number, hash: number): string[] {
  return [
    `setoption name Threads value ${threads}`,
    `setoption name Hash value ${hash}`,
    'setoption name UCI_Chess960 value false',
  ];
}

/**
 * A single Stockfish process speaking UCI. Serializes one evaluate at a time.
 * Score is reported from the side-to-move perspective (matches cpFromEval).
 */
export class UciProcess {
  private proc: ChildProcessWithoutNullStreams;
  private rl: Interface;
  private ready: Promise<void>;
  private busy = false;
  private readonly threads: number;
  private readonly hash: number;
  /** Set once the process exits; used to fail in-flight and future evaluates. */
  private exited: Error | null = null;
  /** Reject hook for whatever operation is currently awaiting engine output. */
  private rejectPending: ((err: Error) => void) | null = null;
  /** True once dispose() is called, so the resulting exit isn't flagged a crash. */
  private disposing = false;

  constructor(binPath: string, opts: UciOptions = {}) {
    this.threads = opts.threads ?? 1;
    this.hash = opts.hash ?? 16;
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
          // Analysis is deterministic when Threads=1 (default): at fixed depth
          // it yields identical results across runs/machines, and ucinewgame
          // before each position (see runGo) makes pool order irrelevant.
          // Threads>1 speeds a single search but is non-deterministic.
          for (const cmd of engineSetOptions(this.threads, this.hash)) this.send(cmd);
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
      const acc = new Map<number, EngineLine>();
      const timeoutMs = evalTimeoutMs(opts);

      // Guard against a wedged (but not crashed) engine: without this a process
      // that stops emitting `bestmove` would hang the whole job indefinitely.
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`stockfish timed out after ${timeoutMs}ms`));
      }, timeoutMs);
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
          if (parsed) applyInfoLine(acc, parsed);
        } else if (line.startsWith('bestmove')) {
          cleanup();
          const bestToken = line.split(/\s+/)[1];
          resolve(collectEval(acc, bestToken, opts.multiPv ?? 1));
        }
      };
      this.rl.on('line', onLine);
      this.proc.once('error', onErr);

      for (const cmd of goCommands(fen, opts)) this.send(cmd);
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

export interface InfoLine {
  cp?: number;
  mate?: number;
  pv?: string[];
  depth?: number;
  bound?: boolean;
  /** 1-based UCI multipv index; absent when MultiPV is 1 (Stockfish omits it) */
  multipv?: number;
}

/**
 * The commands sent for one evaluation. Pure and exported so the MultiPV
 * wiring is unit-testable without spawning Stockfish.
 *
 * MultiPV is sent on EVERY go, including the implicit `value 1`. Engine
 * processes are pooled and reused across jobs, and nothing else resets the
 * option — so omitting it when multiPv is 1 would let the deep analysis pass
 * leave MultiPV=3 set on a process that a later shallow eval then picks up.
 */
export function goCommands(fen: string, opts: EngineEvaluateOptions): string[] {
  return [
    // Reset the transposition table before each position so the result is
    // independent of the order the pool happened to feed positions in.
    'ucinewgame',
    `setoption name MultiPV value ${opts.multiPv ?? 1}`,
    `position fen ${fen}`,
    // Prefer fixed depth (deterministic). movetime is a non-deterministic
    // opt-in kept for callers that explicitly want a time budget.
    opts.depth ? `go depth ${opts.depth}` : `go movetime ${opts.movetimeMs ?? 150}`,
  ];
}

export function parseInfo(line: string): InfoLine | null {
  const tokens = line.split(/\s+/);
  const info: InfoLine = {};
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'depth') info.depth = Number(tokens[i + 1]);
    else if (t === 'multipv') info.multipv = Number(tokens[i + 1]);
    else if (t === 'score') {
      const kind = tokens[i + 1];
      const val = Number(tokens[i + 2]);
      if (kind === 'cp') info.cp = val;
      else if (kind === 'mate') info.mate = val;
      if (tokens[i + 3] === 'lowerbound' || tokens[i + 3] === 'upperbound') info.bound = true;
    } else if (t === 'pv') {
      // Stockfish always emits `multipv` before `pv`, so stopping here is safe.
      info.pv = tokens.slice(i + 1);
      break;
    }
  }
  return info.cp !== undefined || info.mate !== undefined || info.pv ? info : null;
}

/**
 * Fold one `info` line into the per-rank accumulator. Bound scores are
 * discarded (they are provisional aspiration-window results), and a rank is
 * only overwritten by a line of equal or greater depth so a partial deeper
 * iteration cannot be clobbered by a stale shallower one arriving late.
 */
export function applyInfoLine(acc: Map<number, EngineLine>, info: InfoLine): void {
  if (info.bound) return;
  if (!info.pv || info.pv.length === 0) return;
  if (info.cp === undefined && info.mate === undefined) return;

  const rank = info.multipv ?? 1;
  const depth = info.depth ?? 0;
  const existing = acc.get(rank);
  if (existing && existing.depth > depth) return;

  acc.set(rank, {
    rank,
    ...(info.mate !== undefined ? { mate: info.mate } : { cp: info.cp }),
    pv: info.pv,
    depth,
  });
}

/**
 * Resolve the accumulator into an EngineEval once `bestmove` arrives. Rank 1
 * supplies the flat cp/mate/pv/depth fields so existing single-PV callers see
 * exactly what they did before; `lines` is attached only for MultiPV callers.
 */
export function collectEval(
  acc: Map<number, EngineLine>,
  bestToken: string | undefined,
  multiPv: number,
): EngineEval {
  const all = [...acc.values()].sort((a, b) => a.rank - b.rank);
  // Drop ranks left over from an earlier, shallower iteration — when the search
  // is cut mid-iteration the deeper lines are the trustworthy ones.
  const best = all[0];
  const lines = best ? all.filter((l) => l.depth >= best.depth) : [];

  const top = lines[0];
  const bestMove = bestToken ?? top?.pv[0] ?? '(none)';
  const pv = top?.pv.length ? top.pv : [bestMove];

  return {
    ...(top?.mate !== undefined ? { mate: top.mate } : { cp: top?.cp }),
    bestMove,
    pv,
    depth: top?.depth ?? 0,
    // Stockfish returns fewer lines than requested when the position has fewer
    // legal moves, so this may be shorter than multiPv.
    ...(multiPv > 1 && lines.length > 0 ? { lines } : {}),
  };
}
