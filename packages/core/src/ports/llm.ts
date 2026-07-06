/** LlmProvider port (spec §8.1). Vendors implement this in packages/adapters. */

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmGenerateOptions {
  model?: string;
  temperature?: number; // default 0.4
  maxOutputTokens?: number;
  responseFormat?: 'text' | 'json';
  jsonSchema?: object; // when responseFormat === 'json'
  timeoutMs?: number;
  metadata?: Record<string, string>; // tracing / cost attribution
}

export interface LlmResult {
  text: string;
  parsed?: unknown; // when json
  usage?: { inputTokens: number; outputTokens: number };
  model: string;
  provider: string;
}

export interface LlmProvider {
  readonly name: string;
  generate(messages: LlmMessage[], opts?: LlmGenerateOptions): Promise<LlmResult>;
}
