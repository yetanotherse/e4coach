/**
 * Narration stage. Takes the deterministic facts produced by the deep pass and
 * has the LLM rephrase them in a coach's voice. Purely an upgrade: every
 * example already carries usable prose from `renderExplanation`, so anything
 * this stage cannot improve is simply left alone.
 *
 * Degradation is per BATCH and per ITEM — a failed call, a schema violation, or
 * a hallucinated move costs only the affected explanations, never the report.
 */
import {
  buildExplainMessages,
  collectGroundedExplanations,
  EXPLAIN_JSON_SCHEMA,
  type ExplanationFacts,
  type LlmProvider,
  type MoveExplanation,
} from '@chess-coach/core';
import { applyEnrichments, type Enrichment } from './deepen.js';
import type { WeaknessProfile } from '@chess-coach/core';

export interface ExplainOptions {
  /**
   * Mistakes per LLM call. Small enough that one bad response costs little and
   * output stays well inside token limits; large enough to keep call count low.
   */
  batchSize: number;
  /** concurrent in-flight calls */
  concurrency: number;
}

export const DEFAULT_EXPLAIN_OPTIONS: ExplainOptions = { batchSize: 6, concurrency: 2 };

/**
 * Placeholder used only if narration somehow produces an id the deep pass did
 * not enrich. Should be unreachable — both maps are built from the same facts —
 * but it keeps the merge total rather than silently dropping the improvement.
 */
const FALLBACK: MoveExplanation = {
  whatWentWrong: '',
  whyBetter: '',
  takeaway: '',
  source: 'template',
};

/** Split into fixed-size batches. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += Math.max(1, size)) {
    out.push(items.slice(i, i + Math.max(1, size)));
  }
  return out;
}

export interface NarrateResult {
  profile: WeaknessProfile;
  /** how many explanations the model successfully improved */
  narrated: number;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Narrate the given facts and return a NEW profile with the improved prose
 * merged in. Examples the model did not (or could not safely) improve keep the
 * deterministic text the deep pass already attached.
 */
export async function narrateExplanations(
  profile: WeaknessProfile,
  facts: Map<string, ExplanationFacts>,
  llm: LlmProvider,
  existing: Map<string, Enrichment>,
  opts: ExplainOptions = DEFAULT_EXPLAIN_OPTIONS,
): Promise<NarrateResult> {
  const usage = { inputTokens: 0, outputTokens: 0 };
  // The mock provider has no real chess prose to offer.
  if (facts.size === 0 || llm.name === 'mock') {
    return { profile, narrated: 0, usage };
  }

  const batches = chunk([...facts.values()], opts.batchSize);
  const improved = new Map<string, MoveExplanation>();

  // Bounded concurrency: a shared cursor consumed by N workers.
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, opts.concurrency) }, async () => {
    for (;;) {
      const index = cursor++;
      const batch = batches[index];
      if (!batch) return;
      const result = await narrateBatch(batch, facts, llm);
      for (const [id, explanation] of result.items) improved.set(id, explanation);
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
    }
  });
  await Promise.all(workers);

  if (improved.size === 0) return { profile, narrated: 0, usage };

  // Merge over the deterministic enrichments, preserving their variations —
  // boards always come from the engine, never from the model. Iterating the
  // union (not just `existing`) means an improvement can never be silently
  // dropped while still being counted as narrated.
  const merged = new Map<string, Enrichment>();
  for (const id of new Set([...existing.keys(), ...improved.keys()])) {
    const enrichment = existing.get(id) ?? { explanation: FALLBACK, variations: [] };
    const better = improved.get(id);
    merged.set(id, better ? { ...enrichment, explanation: better } : enrichment);
  }

  return {
    profile: applyEnrichments(profile, merged),
    narrated: improved.size,
    usage,
  };
}

interface BatchResult {
  items: Map<string, MoveExplanation>;
  usage: { inputTokens: number; outputTokens: number };
}

/** One LLM call. Never throws — a failed batch just yields nothing. */
async function narrateBatch(
  batch: ExplanationFacts[],
  factsById: Map<string, ExplanationFacts>,
  llm: LlmProvider,
): Promise<BatchResult> {
  const empty: BatchResult = { items: new Map(), usage: { inputTokens: 0, outputTokens: 0 } };
  try {
    const result = await llm.generate(buildExplainMessages(batch), {
      responseFormat: 'json',
      jsonSchema: EXPLAIN_JSON_SCHEMA,
      // temperature 0 → stable wording for identical inputs (spec §9.3).
      temperature: 0,
      metadata: { stage: 'explain', count: String(batch.length) },
    });

    const grounded = collectGroundedExplanations(
      result.parsed ?? safeJson(result.text),
      factsById,
    );
    const rejected = batch.length - grounded.size;
    if (rejected > 0) {
      console.warn(
        `[explain] ${rejected}/${batch.length} explanation(s) rejected (schema or ungrounded move); keeping deterministic text`,
      );
    }

    const items = new Map<string, MoveExplanation>();
    for (const [id, item] of grounded) {
      items.set(id, {
        whatWentWrong: item.whatWentWrong,
        whyBetter: item.whyBetter,
        takeaway: item.takeaway,
        source: 'llm',
      });
    }
    return {
      items,
      usage: {
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
      },
    };
  } catch (err) {
    console.warn(
      '[explain] batch failed; keeping deterministic text:',
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
