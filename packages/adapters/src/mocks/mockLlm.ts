import type {
  LlmProvider,
  LlmMessage,
  LlmGenerateOptions,
  LlmResult,
} from '@chess-coach/core';

/**
 * Deterministic LLM stub. When asked for JSON (the report prompt), it echoes a
 * minimal, schema-shaped object built from the prompt so the deterministic
 * renderer downstream has something real to work with. For text, returns a
 * fixed string. No network, no vendor SDK.
 */
export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock';

  async generate(messages: LlmMessage[], opts?: LlmGenerateOptions): Promise<LlmResult> {
    const model = opts?.model ?? 'mock-model';
    if (opts?.responseFormat === 'json') {
      const parsed = {
        headline: 'A few clear, fixable patterns are costing you rating.',
        intro:
          'Based on your recent games, here are the areas where focused work will pay off fastest.',
        sections: [] as unknown[],
      };
      return {
        text: JSON.stringify(parsed),
        parsed,
        usage: { inputTokens: 100, outputTokens: 50 },
        model,
        provider: this.name,
      };
    }
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    return {
      text: `MOCK: ${lastUser?.content.slice(0, 80) ?? ''}`,
      usage: { inputTokens: 20, outputTokens: 10 },
      model,
      provider: this.name,
    };
  }
}
