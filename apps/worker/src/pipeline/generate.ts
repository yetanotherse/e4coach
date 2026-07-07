/**
 * Generate stage (spec §9.1.8, §11.4). Turns the engine-grounded WeaknessProfile
 * into a ReportContent. The LLM only rephrases facts already in the profile;
 * example positions always come from the profile, never the model. On any LLM
 * error, timeout, or invalid output we fall back to the deterministic template
 * so the user always gets a correct report (graceful degradation).
 */
import type { LlmProvider, ReportContent, WeaknessProfile } from '@chess-coach/core';
import {
  renderReportTemplate,
  buildReportMessages,
  REPORT_JSON_SCHEMA,
  LlmReportSchema,
  mergeLlmReport,
} from '@chess-coach/core';

export async function generateReport(
  profile: WeaknessProfile,
  llm: LlmProvider,
): Promise<ReportContent> {
  // Deterministic, always-correct baseline built purely from the profile.
  const template = renderReportTemplate(profile);

  // Mock provider carries no real chess prose — use the grounded template as-is.
  if (llm.name === 'mock') return template;

  // No weaknesses to describe → nothing for the LLM to add.
  if (profile.topWeaknesses.length === 0) return template;

  try {
    const result = await llm.generate(buildReportMessages(profile), {
      responseFormat: 'json',
      jsonSchema: REPORT_JSON_SCHEMA,
      temperature: 0.4,
      metadata: { username: profile.username, source: profile.source },
    });
    const parsed = LlmReportSchema.safeParse(result.parsed ?? safeJson(result.text));
    if (!parsed.success) {
      console.warn('[generate] LLM output failed schema validation; using template');
      return template;
    }
    return mergeLlmReport(profile, parsed.data);
  } catch (err) {
    console.warn('[generate] LLM call failed; using template:', err instanceof Error ? err.message : err);
    return template;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
