import type {
  LlmProvider,
  LlmMessage,
  LlmGenerateOptions,
  LlmResult,
} from '@chess-coach/core';
import { withResilience, type ResilienceOptions, type StatusError } from './resilience.js';

const BASE = 'https://api.deepseek.com';

export interface DeepSeekOptions {
  apiKey: string;
  model: string;
  /** DeepSeek V4 thinking mode — off by default (short deterministic narration). */
  thinking?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  onUsage?: ResilienceOptions['onUsage'];
  baseUrl?: string;
}

/**
 * DeepSeek provider behind LlmProvider (spec §8.1). Uses the OpenAI-compatible
 * chat/completions API. JSON mode is `response_format: {type: 'json_object'}` —
 * there is no native schema enforcement like Gemini's responseSchema, so the
 * schema is embedded in the system prompt as an example and the caller's Zod
 * validation (plus grounding) remains the real guarantee.
 */
export class DeepSeekProvider implements LlmProvider {
  readonly name = 'deepseek';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: DeepSeekOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async generate(messages: LlmMessage[], opts: LlmGenerateOptions = {}): Promise<LlmResult> {
    const model = opts.model ?? this.opts.model;
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const others = messages.filter((m) => m.role !== 'system');

    // DeepSeek's JSON Output requires the word "json" in the prompt and an
    // example of the desired shape; the schemas already say "Return ONLY JSON",
    // and we append the schema as the structural example.
    const systemContent =
      opts.responseFormat === 'json' && opts.jsonSchema
        ? `${system}\n\nRespond with JSON matching this shape: ${JSON.stringify(opts.jsonSchema)}`
        : system;

    const mapped = [
      ...(systemContent ? [{ role: 'system', content: systemContent }] : []),
      ...others.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    const body: Record<string, unknown> = {
      model,
      messages: mapped,
      temperature: opts.temperature ?? 0.4,
      ...(opts.maxOutputTokens ? { max_tokens: opts.maxOutputTokens } : {}),
      thinking: { type: this.opts.thinking ? 'enabled' : 'disabled' },
      ...(opts.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
    };

    const url = `${this.opts.baseUrl ?? BASE}/chat/completions`;

    return withResilience(
      async (signal) => {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.opts.apiKey}`,
          },
          body: JSON.stringify(body),
          signal,
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          const err: StatusError = new Error(`DeepSeek ${res.status}: ${detail.slice(0, 300)}`);
          err.status = res.status;
          throw err;
        }
        const json = (await res.json()) as DeepSeekResponse;
        const text = json.choices?.[0]?.message?.content ?? '';
        const result: LlmResult = {
          text,
          model,
          provider: this.name,
          usage: {
            inputTokens: json.usage?.prompt_tokens ?? 0,
            outputTokens: json.usage?.completion_tokens ?? 0,
          },
        };
        if (opts.responseFormat === 'json' && text) {
          try {
            result.parsed = JSON.parse(text);
          } catch {
            /* leave parsed undefined; caller falls back */
          }
        }
        return result;
      },
      {
        timeoutMs: opts.timeoutMs ?? this.opts.timeoutMs ?? 30_000,
        maxRetries: this.opts.maxRetries ?? 2,
        ...(this.opts.onUsage ? { onUsage: this.opts.onUsage } : {}),
      },
    );
  }
}

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}
