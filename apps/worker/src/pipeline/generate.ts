/**
 * Generate stage (spec §9.1.8, §11.4). Turns the engine-grounded WeaknessProfile
 * into a ReportContent. The LLM only rephrases facts already in the profile; if
 * it fails or is unavailable, we fall back to the deterministic template so the
 * user always gets a correct report (graceful degradation).
 *
 * Phase B: the mock LLM has no real prose, so we render the template directly.
 * Phase C wires the JSON-schema Gemini prompt here, keeping this fallback path.
 */
import type { LlmProvider, ReportContent, WeaknessProfile } from '@chess-coach/core';
import { renderReportTemplate } from '@chess-coach/core';

export async function generateReport(
  profile: WeaknessProfile,
  llm: LlmProvider,
): Promise<ReportContent> {
  // Deterministic, always-correct baseline built purely from the profile.
  const template = renderReportTemplate(profile);

  // Mock provider carries no real chess prose — use the grounded template as-is.
  if (llm.name === 'mock') return template;

  // Phase C: call llm.generate() with the JSON-schema report prompt, validate,
  // and merge prose over `template`. On any error, return `template` unchanged.
  return template;
}
