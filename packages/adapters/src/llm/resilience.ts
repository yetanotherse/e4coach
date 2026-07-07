import type { LlmResult } from '@chess-coach/core';

export interface ResilienceOptions {
  timeoutMs: number;
  maxRetries: number;
  /** cost/telemetry sink; receives usage after each successful call */
  onUsage?: (usage: { provider: string; model: string; inputTokens: number; outputTokens: number }) => void;
}

/** Retry with exponential backoff + jitter; hard per-attempt timeout. */
export async function withResilience(
  fn: (signal: AbortSignal) => Promise<LlmResult>,
  opts: ResilienceOptions,
): Promise<LlmResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const result = await fn(controller.signal);
      if (result.usage && opts.onUsage) {
        opts.onUsage({
          provider: result.provider,
          model: result.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        });
      }
      return result;
    } catch (err) {
      lastErr = err;
      if (attempt < opts.maxRetries) {
        await sleep(Math.min(20_000, 500 * 2 ** attempt) + Math.random() * 250);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
