/**
 * Report generation prompt + grounding contract (spec §8.1, §9.1.8). The LLM
 * ONLY rephrases facts already computed by the engine/classifier — it never
 * invents evals, moves, or tactics. It returns JSON matching REPORT_JSON_SCHEMA;
 * we validate it and render deterministically, attaching the real example
 * positions from the profile (never from the model).
 */
import { z } from 'zod';
import type { WeaknessProfile } from '../profile.js';
import type { ReportContent } from '../report.js';
import type { LlmMessage } from '../ports/llm.js';
import { CATEGORY_META, WEAKNESS_CATEGORIES } from '../taxonomy.js';
import { renderReportTemplate } from '../analysis/renderTemplate.js';

const SYSTEM = `You are a supportive, concrete chess coach writing a short weakness report for an adult improver (rated roughly 800-1600).

STRICT RULES:
- You are given a pre-computed analysis. Only rephrase and explain those facts.
- NEVER invent moves, evaluations, tactics, or positions. Do not reference any move not provided.
- Keep it encouraging, plain-language, and specific. No jargon dumps.
- Return ONLY JSON matching the provided schema. Use the exact category ids provided.`;

/** Compact, PII-minimal facts sent to the model (spec §11.3 — no full PGNs). */
function factsFor(profile: WeaknessProfile) {
  const top = profile.topWeaknesses
    .map((cat) => profile.categories.find((c) => c.category === cat))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({
      category: c.category,
      name: CATEGORY_META[c.category].displayName,
      frequency: c.frequency,
      estimatedRatingLoss: c.estimatedRatingLoss,
      // Cap examples sent to the model for token control; the UI shows all.
      examples: c.examples.slice(0, 4).map((e) => ({
        moveNumber: e.moveNumber,
        youPlayed: e.playedMove,
        betterMove: e.betterMove,
        note: e.note,
      })),
    }));
  return {
    gamesAnalyzed: profile.gamesAnalyzed,
    lowConfidence: profile.lowConfidence,
    topWeaknesses: top,
  };
}

export function buildReportMessages(profile: WeaknessProfile): LlmMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Write the report from these facts. JSON only.\n\n${JSON.stringify(
        factsFor(profile),
        null,
        2,
      )}`,
    },
  ];
}

/** JSON schema handed to the provider for structured output. */
export const REPORT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    intro: { type: 'string' },
    weaknesses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: [...WEAKNESS_CATEGORIES] },
          explanation: { type: 'string' },
          recommendation: { type: 'string' },
        },
        required: ['category', 'explanation', 'recommendation'],
      },
    },
  },
  required: ['headline', 'intro', 'weaknesses'],
} as const;

/** Validator for the model's JSON output. */
export const LlmReportSchema = z.object({
  headline: z.string().min(1).max(300),
  intro: z.string().min(1).max(1000),
  weaknesses: z
    .array(
      z.object({
        category: z.enum(WEAKNESS_CATEGORIES),
        explanation: z.string().min(1).max(2000),
        recommendation: z.string().min(1).max(2000),
      }),
    )
    .min(1),
});
export type LlmReport = z.infer<typeof LlmReportSchema>;

/**
 * Merge validated LLM prose over the deterministic template. Example positions
 * ALWAYS come from the profile (via the template), never from the model, so
 * boards can never be fabricated. Returns non-degraded content.
 */
export function mergeLlmReport(profile: WeaknessProfile, llm: LlmReport): ReportContent {
  const base = renderReportTemplate(profile); // real examples + safe fallbacks
  const proseByCategory = new Map(llm.weaknesses.map((w) => [w.category, w]));

  const weaknesses = base.weaknesses.map((section) => {
    const prose = proseByCategory.get(section.category);
    return prose
      ? { ...section, explanation: prose.explanation, recommendation: prose.recommendation }
      : section;
  });

  return {
    headline: llm.headline,
    intro: llm.intro,
    weaknesses,
    ...(base.confidenceNote ? { confidenceNote: base.confidenceNote } : {}),
    degraded: false,
  };
}
