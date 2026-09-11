/**
 * Plan goal phrasing prompt (plans/phase-2.md 2.2a). Mirrors the report
 * prompt's grounding contract: the model only rephrases per-theme goals around
 * pre-computed facts. Items and drills come from the deterministic assembler;
 * failed/unusable output falls back to the template goals.
 */
import { z } from 'zod';
import type { LlmMessage } from '../ports/llm.js';
import { WEAKNESS_CATEGORIES } from '../taxonomy.js';
import type { GoalFacts } from '../plan/types.js';

const SYSTEM = `You are a supportive, concrete chess coach writing one weekly goal per weakness theme for an adult improver (rated roughly 800-1600).

STRICT RULES:
- You are given pre-computed facts per theme (frequency of the error pattern and how many drill positions were derived from the player's own games).
- Only rephrase those facts into a motivating, concrete goal. NEVER invent moves, evaluations, or openings.
- Each goal: 1-2 sentences, plain language, what to practice and why it matters. No jargon dumps.
- Return ONLY JSON matching the provided schema. Use the exact theme ids provided.`;

export function buildPlanMessages(facts: GoalFacts[]): LlmMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Write one weekly goal per theme. JSON only.\n\n${JSON.stringify(facts, null, 2)}`,
    },
  ];
}

export const PLAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    goals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          theme: { type: 'string', enum: [...WEAKNESS_CATEGORIES] },
          goal: { type: 'string' },
        },
        required: ['theme', 'goal'],
      },
    },
  },
  required: ['goals'],
} as const;

export const LlmPlanSchema = z.object({
  goals: z
    .array(
      z.object({
        theme: z.enum(WEAKNESS_CATEGORIES),
        goal: z.string().min(1).max(600),
      }),
    )
    .min(1),
});
export type LlmPlan = z.infer<typeof LlmPlanSchema>;

/**
 * Merge validated LLM goals over the template draft. Goals are matched by
 * theme id; anything missing or unrecognized keeps its template text.
 */
export function mergeLlmGoals(
  items: Array<{ theme: string; goal: string }>,
  llm: LlmPlan,
): Array<{ theme: string; goal: string }> {
  const byTheme = new Map(llm.goals.map((g) => [g.theme, g.goal]));
  return items.map((item) => {
    const goal = byTheme.get(item.theme as (typeof WEAKNESS_CATEGORIES)[number]);
    return goal ? { ...item, goal } : item;
  });
}
