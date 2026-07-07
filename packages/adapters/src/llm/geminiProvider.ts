import type {
  LlmProvider,
  LlmMessage,
  LlmGenerateOptions,
  LlmResult,
} from '@chess-coach/core';
import { withResilience, type ResilienceOptions } from './resilience.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiOptions {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  onUsage?: ResilienceOptions['onUsage'];
  baseUrl?: string;
}

/**
 * Gemini Flash provider behind LlmProvider (spec §8.1). Maps our neutral message
 * shape to the Generative Language API, supports JSON-schema structured output,
 * and wraps calls in the shared retry/timeout/cost-logging helper.
 */
export class GeminiFlashProvider implements LlmProvider {
  readonly name = 'gemini';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: GeminiOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async generate(messages: LlmMessage[], opts: LlmGenerateOptions = {}): Promise<LlmResult> {
    const model = opts.model ?? this.opts.model;
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const generationConfig: Record<string, unknown> = {
      temperature: opts.temperature ?? 0.4,
      ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
    };
    if (opts.responseFormat === 'json') {
      generationConfig.responseMimeType = 'application/json';
      if (opts.jsonSchema) generationConfig.responseSchema = opts.jsonSchema;
    }

    const body = {
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig,
    };

    const url = `${this.opts.baseUrl ?? BASE}/models/${model}:generateContent?key=${this.opts.apiKey}`;

    return withResilience(
      async (signal) => {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`Gemini ${res.status}: ${detail.slice(0, 300)}`);
        }
        const json = (await res.json()) as GeminiResponse;
        const text =
          json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
        const result: LlmResult = {
          text,
          model,
          provider: this.name,
          usage: {
            inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
            outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
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

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}
