/**
 * Drill-insight pass (post-solve AI analysis for drills). Puzzle drills come
 * from the Lichess database and are never engine-analyzed anywhere else, so
 * this pass — run at plan-generation time — asks the engine the same questions
 * the deep pass asks report examples:
 *
 *   1. what is the evaluation before the solution?        (MultiPV over drill.fen)
 *   2. what does the position look like after the line?   (eval of the end position)
 *   3. did anything else also work?                       (MultiPV ranks 2..N)
 *
 * The answers become engine-grounded facts, the LLM rephrases them in a
 * coach's voice (same batch + grounding contract as explain.ts), and the
 * result is persisted on the Drill row so the solved-drill panel can show
 * full report parity: prose, eval swing, steppable engine variations.
 *
 * Degradation is per DRILL — a failed eval, a schema violation, or a
 * hallucinated move costs only that drill's explanation (it simply stays
 * absent), never the plan and never the job. With the mock LLM the engine
 * facts and template prose are still persisted — narration is skipped.
 */
import { Prisma, type PrismaClient } from '@chess-coach/db';
import type { ChessEngine, LlmProvider, MoveExplanation } from '@chess-coach/core';
import {
  buildPuzzleExplainMessages,
  collectGroundedExplanations,
  derivePuzzleExplanationFacts,
  EXPLAIN_JSON_SCHEMA,
  replayUci,
  renderPuzzleExplanation,
  sanForUci,
  type ExplanationFacts,
} from '@chess-coach/core';
import { chunk } from './explain.js';

export interface DrillExplainOptions {
  /** search depth — reuse the deep-analysis depth (these lines are shown) */
  depth: number;
  /** MultiPV width: the solution plus alternatives that also work */
  multiPv: number;
  /** plies of each variation kept for the stepper */
  maxPvPlies: number;
  /** LLM batch size / concurrency, same reasoning as explain.ts */
  batchSize: number;
  concurrency: number;
  /** hard cap on drills analyzed per run — the only real bound on runtime */
  maxDrills: number;
}

export interface DrillExplainResult {
  explained: number;
  usage: { inputTokens: number; outputTokens: number };
}

/** LLM call knobs, shared with the report explain stage defaults. */
export const DEFAULT_DRILL_EXPLAIN_LLM_OPTIONS = { batchSize: 6, concurrency: 2 } as const;

/** Internal: one puzzle drill resolved from the DB, plus its source puzzle. */

/** Persisted explanation payload for one drill (everything but the prose). */
interface DrillInsight {
  variations: Array<{
    kind: 'refutation' | 'best' | 'alternative';
    label: string;
    startFen: string;
    sans: string[];
    cp?: number;
    mate?: number;
  }>;
  cpBefore?: number;
  cpAfter?: number;
}

/**
 * Analyze and persist explanations for puzzle drills that have none.
 *
 * Never throws: every failure path is per-drill and leaves that drill without
 * an explanation. `drillIds` should be the drill ids linked to this week's
 * plan; only puzzle drills still lacking an explanation are analyzed, capped
 * at `opts.maxDrills`.
 */
export async function explainPuzzleDrills(
  db: PrismaClient,
  drillIds: string[],
  engine: ChessEngine,
  llm: LlmProvider,
  opts: DrillExplainOptions,
): Promise<DrillExplainResult> {
  const usage = { inputTokens: 0, outputTokens: 0 };
  if (drillIds.length === 0 || opts.maxDrills === 0 || engine.name === 'mock') {
    return { explained: 0, usage };
  }

  const rows = await db.drill.findMany({
    where: { id: { in: drillIds }, type: 'puzzle', explanation: { equals: Prisma.DbNull } },
    select: { id: true, fen: true, sideToMove: true, solutionUci: true, solutionLine: true, puzzleId: true },
    take: opts.maxDrills,
  });
  if (rows.length === 0) return { explained: 0, usage };

  // Resolve each drill's source puzzle: the stored Puzzle.fen is one move
  // before the drill position, and line[0] is the opponent's setup move —
  // exactly the "played move" the puzzle framing narrates around.
  const puzzleIds = [...new Set(rows.map((r) => r.puzzleId).filter((x): x is string => Boolean(x)))];
  const puzzles = await db.puzzle.findMany({
    where: { externalId: { in: puzzleIds } },
    select: { externalId: true, fen: true, line: true },
  });
  const puzzleByExternalId = new Map(puzzles.map((p) => [p.externalId, p]));

  const factsById = new Map<string, ExplanationFacts>();
  const factsByDrill = new Map<string, ExplanationFacts>();
  const insights = new Map<string, DrillInsight>();

  for (const row of rows) {
    try {
      const derived = await analyzeOne(row, puzzleByExternalId, engine, opts);
      if (derived) {
        factsById.set(derived.facts.id, derived.facts);
        factsByDrill.set(row.id, derived.facts);
        insights.set(row.id, derived.insight);
      }
    } catch (err) {
      console.warn(
        `[drillExplain] skipped drill ${row.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  if (factsById.size === 0) return { explained: 0, usage };

  // Narrate in coach voice. Strictly an upgrade over the template prose: any
  // rejected item keeps the deterministic text derived above.
  const narrated =
    llm.name === 'mock'
      ? { items: new Map<string, MoveExplanation>(), usage: { inputTokens: 0, outputTokens: 0 } }
      : await narrate(factsById, llm, opts);
  usage.inputTokens += narrated.usage.inputTokens;
  usage.outputTokens += narrated.usage.outputTokens;

  let explained = 0;
  for (const [drillId, insight] of insights) {
    const facts = factsByDrill.get(drillId);
    if (!facts) continue;
    const better = narrated.items.get(facts.id);
    const explanation: MoveExplanation = better
      ? { ...better, source: 'llm' }
      : { ...renderPuzzleExplanation(facts), source: 'template' };

    try {
      await db.drill.update({
        where: { id: drillId },
        data: {
          explanation: explanation as unknown as Prisma.InputJsonValue,
          variations: insight.variations as unknown as Prisma.InputJsonValue,
          ...(insight.cpBefore !== undefined ? { cpBefore: insight.cpBefore } : {}),
          ...(insight.cpAfter !== undefined ? { cpAfter: insight.cpAfter } : {}),
        },
      });
      explained++;
    } catch (err) {
      console.warn(
        `[drillExplain] could not persist explanation for drill ${drillId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `[drillExplain] explained ${explained}/${rows.length} puzzle drill(s) ` +
      `(${usage.inputTokens} in / ${usage.outputTokens} out tokens)`,
  );
  return { explained, usage };
}

/** Analyze one puzzle drill: pre-eval, post-eval, derived facts + insight. */
async function analyzeOne(
  row: {
    id: string;
    fen: string;
    sideToMove: string;
    solutionUci: string;
    solutionLine: string | null;
    puzzleId: string | null;
  },
  puzzleByExternalId: Map<string, { fen: string; line: string }>,
  engine: ChessEngine,
  opts: DrillExplainOptions,
): Promise<{ facts: ExplanationFacts; insight: DrillInsight } | null> {
  const puzzle = row.puzzleId ? puzzleByExternalId.get(row.puzzleId) : undefined;
  if (!puzzle) return null;

  // Lichess convention: Puzzle.fen is one move BEFORE the puzzle and line[0]
  // is the opponent's setup move. That setup move is the mistake the solver
  // punishes — the anchor of the puzzle framing.
  const setupUci = puzzle.line.trim().split(/\s+/)[0];
  if (!setupUci || setupUci.length < 4) return null;
  const setupSan = sanForUci(puzzle.fen, setupUci);
  if (!setupSan) return null;

  const solutionLine = (row.solutionLine?.trim() || row.solutionUci).split(/\s+/).filter(Boolean);
  if (solutionLine.length === 0) return null;

  // The position after the line — where the reward is counted.
  const played = replayUci(row.fen, solutionLine, opts.maxPvPlies + 1);
  if (played.sans.length === 0) return null;

  // MultiPV over the position the solver faces: rank 1 is the solution (its
  // score is already solver-POV); ranks 2..N are alternatives that also work.
  const before = await engine.evaluate(row.fen, { depth: opts.depth, multiPv: opts.multiPv });
  const after = await engine.evaluate(played.endFen, { depth: opts.depth });

  // Normalize the after-eval into the solver's POV: it is side-to-move POV,
  // so negate when it is the opponent's turn at the end of the line.
  const solverIsToMove = played.endFen.split(' ')[1] === (row.sideToMove === 'black' ? 'b' : 'w');
  const sign = solverIsToMove ? 1 : -1;
  const afterPov =
    typeof after.mate === 'number'
      ? { mate: sign * after.mate }
      : typeof after.cp === 'number'
        ? { cp: sign * after.cp }
        : {};

  const beforePov =
    typeof before.mate === 'number'
      ? { mate: before.mate }
      : typeof before.cp === 'number'
        ? { cp: before.cp }
        : {};

  const facts = derivePuzzleExplanationFacts({
    id: `puzzle:${row.id}`,
    fen: row.fen,
    solverColor: row.sideToMove === 'black' ? 'black' : 'white',
    setupUci,
    setupSan,
    solutionLine: solutionLine.join(' '),
    ...beforePov,
    ...afterPov,
    alternativePvs: (before.lines ?? []).filter((l) => l.rank > 1).map((l) => l.pv),
    maxPlies: opts.maxPvPlies,
  });
  if (!facts) return null;

  // Variations already carry startFen + SAN (+ eval) — the storage shape.
  const insight: DrillInsight = {
    variations: facts.variations,
    ...(beforePov.cp !== undefined ? { cpBefore: beforePov.cp } : {}),
    ...(afterPov.cp !== undefined ? { cpAfter: afterPov.cp } : {}),
  };
  return { facts, insight };
}

/**
 * Batched LLM narration — same bounded-concurrency pattern as explain.ts,
 * with the puzzle prompt and the same grounding contract.
 */
async function narrate(
  factsById: Map<string, ExplanationFacts>,
  llm: LlmProvider,
  opts: DrillExplainOptions,
): Promise<{ items: Map<string, MoveExplanation>; usage: { inputTokens: number; outputTokens: number } }> {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const batches = chunk([...factsById.values()], opts.batchSize);
  const items = new Map<string, MoveExplanation>();

  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, opts.concurrency) }, async () => {
    for (;;) {
      const batch = batches[cursor++];
      if (!batch) return;
      const result = await narrateBatch(batch, factsById, llm);
      for (const [id, explanation] of result.items) items.set(id, explanation);
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
    }
  });
  await Promise.all(workers);
  return { items, usage };
}

/** One LLM call. Never throws — a failed batch just yields nothing. */
async function narrateBatch(
  batch: ExplanationFacts[],
  factsById: Map<string, ExplanationFacts>,
  llm: LlmProvider,
): Promise<{ items: Map<string, MoveExplanation>; usage: { inputTokens: number; outputTokens: number } }> {
  const empty = { items: new Map<string, MoveExplanation>(), usage: { inputTokens: 0, outputTokens: 0 } };
  try {
    const result = await llm.generate(buildPuzzleExplainMessages(batch), {
      responseFormat: 'json',
      jsonSchema: EXPLAIN_JSON_SCHEMA,
      // temperature 0 → stable wording for identical inputs (spec §9.3).
      temperature: 0,
      metadata: { stage: 'drill-explain', count: String(batch.length) },
    });
    const grounded = collectGroundedExplanations(result.parsed ?? safeJson(result.text), factsById);
    const rejected = batch.length - grounded.size;
    if (rejected > 0) {
      console.warn(
        `[drillExplain] ${rejected}/${batch.length} explanation(s) rejected (schema or ungrounded move); keeping template text`,
      );
    }
    const usage = {
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
    };
    const items = new Map<string, MoveExplanation>();
    for (const [id, item] of grounded) {
      items.set(id, {
        whatWentWrong: item.whatWentWrong,
        whyBetter: item.whyBetter,
        takeaway: item.takeaway,
        source: 'llm',
      });
    }
    return { items, usage };
  } catch (err) {
    console.warn(
      '[drillExplain] LLM call failed; using template text:',
      err instanceof Error ? err.message : err,
    );
    return empty;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
