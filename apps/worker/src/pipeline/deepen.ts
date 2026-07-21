/**
 * Deep analysis pass. The main EVALUATING stage runs a shallow, single-PV
 * search over every position in every game — enough to score centipawn loss,
 * but not enough to explain anything. This stage goes back over ONLY the
 * mistakes that will actually be shown and asks the engine three questions:
 *
 *   1. how does the opponent punish what the user played?   (eval of fenAfter)
 *   2. what did the engine intend instead?                  (eval of fenBefore)
 *   3. did anything else also hold?                         (MultiPV ranks 2..N)
 *
 * The answers become steppable variations and the deterministic prose that
 * replaces the old "The engine preferred Bxb5." line.
 *
 * IMPORTANT: these evals use MultiPV and a deeper search, which changes the
 * search tree. They are NOT comparable to the shallow evals behind cpBefore /
 * cpAfter and must never be fed back into CPL scoring or severity.
 */
import {
  deriveExplanationFacts,
  renderExplanation,
  replayUci,
  type ChessEngine,
  type EngineEval,
  type ErrorInstance,
  type ExplanationFacts,
  type MoveExplanation,
  type Variation,
  type WeaknessProfile,
} from '@chess-coach/core';

export interface DeepenOptions {
  /** search depth for the deep pass (deeper than the scoring pass) */
  depth: number;
  /** how many ranked lines to request; 3 gives two alternatives */
  multiPv: number;
  /** hard ceiling on positions analyzed — the only real bound on runtime */
  maxPositions: number;
  /** plies of each variation we keep */
  maxPvPlies: number;
}

/** What the deep pass produces for one example. */
export interface Enrichment {
  explanation: MoveExplanation;
  variations: Variation[];
}

export interface DeepenResult {
  /** a NEW profile with explanations attached; the input is left untouched */
  profile: WeaknessProfile;
  /** derived facts keyed by example, for the LLM narration stage */
  facts: Map<string, ExplanationFacts>;
  /**
   * The deterministic enrichments that were applied, keyed by example. The
   * narration stage merges better prose over these while keeping the engine
   * variations intact.
   */
  enrichments: Map<string, Enrichment>;
}

/** Stable key for one mistake, used to dedupe and to join LLM output back. */
export function exampleKey(ex: Pick<ErrorInstance, 'gameId' | 'ply'>): string {
  return `${ex.gameId}:${ex.ply}`;
}

/**
 * Every example the report will actually render, deduped and prioritized.
 *
 * The profile carries far more examples than are displayed (up to maxExamples
 * for EVERY category, plus position-type examples), but the report only
 * surfaces the top weaknesses. Analyzing the rest would burn engine time on
 * positions nobody sees.
 */
export function selectTargets(profile: WeaknessProfile, limit: number): ErrorInstance[] {
  const seen = new Set<string>();
  const out: ErrorInstance[] = [];

  const consider = (ex: ErrorInstance): void => {
    const key = exampleKey(ex);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(ex);
  };

  for (const category of profile.topWeaknesses) {
    const stat = profile.categories.find((c) => c.category === category);
    for (const ex of stat?.examples ?? []) consider(ex);
  }
  for (const pt of profile.positionTypes ?? []) {
    for (const ex of pt.examples ?? []) consider(ex);
  }

  // Biggest blunders first, so a low cap still covers the most instructive ones.
  return out.sort((a, b) => b.cpl - a.cpl).slice(0, limit);
}

/**
 * Run the deep pass over the profile's displayed examples.
 *
 * Never throws: a failure on one position leaves that example with its existing
 * `note` and the rest continue. Explanations are a nice-to-have; losing the
 * whole report over them would be a bad trade.
 */
export async function deepenProfile(
  profile: WeaknessProfile,
  engine: ChessEngine,
  opts: DeepenOptions,
  heartbeat?: (done: number, total: number) => Promise<void>,
): Promise<DeepenResult> {
  const targets = selectTargets(profile, opts.maxPositions);
  const facts = new Map<string, ExplanationFacts>();
  const enrichments = new Map<string, Enrichment>();
  if (targets.length === 0) return { profile, facts, enrichments };

  console.log(`[deepen] analyzing ${targets.length} position(s) at depth ${opts.depth}`);
  let done = 0;

  for (const ex of targets) {
    const started = Date.now();
    try {
      const derived = await analyzeOne(ex, engine, opts);
      if (derived) {
        facts.set(derived.id, derived);
        enrichments.set(derived.id, {
          explanation: { ...renderExplanation(derived), source: 'template' },
          variations: trimForStorage(derived.variations),
        });
      }
    } catch (err) {
      console.warn(`[deepen] skipped ${exampleKey(ex)}:`, err instanceof Error ? err.message : err);
    }
    done++;
    console.log(`[deepen]   ${done}/${targets.length} in ${Date.now() - started}ms`);
    await heartbeat?.(done, targets.length);
  }

  return { profile: applyEnrichments(profile, enrichments), facts, enrichments };
}

/** Analyze one mistake: refutation, engine plan, and alternatives. */
async function analyzeOne(
  ex: ErrorInstance,
  engine: ChessEngine,
  opts: DeepenOptions,
): Promise<ExplanationFacts | null> {
  const playedUci = ex.playedMoveUci;
  if (!playedUci) return null;

  // The position after the played move — where the refutation starts.
  const { sans, endFen: fenAfter } = replayUci(ex.fen, [playedUci], 1);
  if (sans.length === 0) return null;

  const [before, after] = await Promise.all([
    engine.evaluate(ex.fen, { depth: opts.depth, multiPv: opts.multiPv }),
    engine.evaluate(fenAfter, { depth: opts.depth }),
  ]);

  // Ranks 2..N are the alternatives; rank 1 is the engine's own choice.
  const alternativePvs = (before.lines ?? []).filter((l) => l.rank > 1).map((l) => l.pv);

  // `before` has the user to move, so its score is already user-POV. `after`
  // has the opponent to move, so it must be negated.
  const best = toUserPov(before, false);
  const refutation = toUserPov(after, true);

  return deriveExplanationFacts({
    id: exampleKey(ex),
    fenBefore: ex.fen,
    userColor: ex.userColor,
    playedUci,
    playedSan: ex.playedMove,
    bestUci: before.bestMove,
    bestPv: before.pv,
    refutationPv: after.pv,
    alternativePvs,
    ...(best.cp !== undefined ? { bestCp: best.cp } : {}),
    ...(best.mate !== undefined ? { bestMate: best.mate } : {}),
    ...(refutation.cp !== undefined ? { refutationCp: refutation.cp } : {}),
    ...(refutation.mate !== undefined ? { refutationMate: refutation.mate } : {}),
    maxPlies: opts.maxPvPlies,
  });
}

/** Normalize a side-to-move engine score into the user's perspective. */
function toUserPov(
  evaluation: Pick<EngineEval, 'cp' | 'mate'>,
  negate: boolean,
): { cp?: number; mate?: number } {
  const sign = negate ? -1 : 1;
  if (typeof evaluation.mate === 'number') return { mate: sign * evaluation.mate };
  if (typeof evaluation.cp === 'number') return { cp: sign * evaluation.cp };
  return {};
}

/**
 * Persist start position + SAN only. The client re-derives per-ply FENs with
 * chess.js, so storing them would just inflate an already-large JSONB blob.
 */
function trimForStorage(variations: Variation[]): Variation[] {
  return variations.map((v) => ({
    kind: v.kind,
    label: v.label,
    startFen: v.startFen,
    sans: v.sans,
    ...(v.cp !== undefined ? { cp: v.cp } : {}),
    ...(v.mate !== undefined ? { mate: v.mate } : {}),
  }));
}

/**
 * Rebuild the profile with enrichments attached. Immutable: examples without an
 * enrichment are passed through by reference and keep their existing `note`.
 */
export function applyEnrichments(
  profile: WeaknessProfile,
  enrichments: Map<string, Enrichment>,
): WeaknessProfile {
  if (enrichments.size === 0) return profile;

  const enrich = (ex: ErrorInstance): ErrorInstance => {
    const found = enrichments.get(exampleKey(ex));
    return found ? { ...ex, explanation: found.explanation, variations: found.variations } : ex;
  };

  return {
    ...profile,
    categories: profile.categories.map((c) => ({ ...c, examples: c.examples.map(enrich) })),
    ...(profile.positionTypes
      ? {
          positionTypes: profile.positionTypes.map((p) => ({
            ...p,
            examples: p.examples.map(enrich),
          })),
        }
      : {}),
  };
}
