import type { LlmResult } from '@chess-coach/core';

export interface ResilienceOptions {
  timeoutMs: number;
  maxRetries: number;
  /** cost/telemetry sink; receives usage after each successful call */
  onUsage?: (usage: { provider: string; model: string; inputTokens: number; outputTokens: number }) => void;
}

/** Error carrying an HTTP status so we can decide whether to retry. */
export interface StatusError extends Error {
  status?: number;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/**
 * Only transient failures are worth retrying: network/abort errors (no status),
 * rate limits (429), and 5xx. A 4xx like 404 ("model no longer available") or
 * 400/403 is permanent — retrying just multiplies the error (spec §11.4).
 */
export function isRetryable(err: unknown): boolean {
  const status = (err as StatusError | undefined)?.status;
  if (status === undefined) return true; // network/timeout/abort
  return RETRYABLE_STATUS.has(status);
}

/** Retry transient failures with exponential backoff + jitter; hard per-attempt timeout. */
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
      if (attempt < opts.maxRetries && isRetryable(err)) {
        await sleep(Math.min(20_000, 500 * 2 ** attempt) + Math.random() * 250);
      } else {
        break; // permanent error, or out of attempts
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
