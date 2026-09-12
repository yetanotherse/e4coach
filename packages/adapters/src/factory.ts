/**
 * Provider selection (spec §8, §16). Domain/pipeline code asks the factory for
 * a port implementation; the concrete vendor is chosen by env. Real adapters
 * (lichess/native/gemini/posthog/resend) are added in Phase C/D — until then
 * the factory falls back to the mock and logs a warning so nothing silently
 * breaks.
 */
import type { Env } from '@chess-coach/config';
import type { Analytics, Billing, ChessEngine, GameSource, LlmProvider, Mailer, RatingSource } from '@chess-coach/core';

import { MockGameSource } from './mocks/mockGameSource.js';
import { MockEngine } from './mocks/mockEngine.js';
import { MockLlmProvider } from './mocks/mockLlm.js';
import { MockAnalytics } from './mocks/mockAnalytics.js';
import { MockMailer } from './mocks/mockMailer.js';
import { MockBilling } from './billing/mockBilling.js';
import { MockRatingSource } from './mocks/mockRatingSource.js';
import { LichessGameSource } from './lichess/lichessGameSource.js';
import { ChessComGameSource } from './chesscom/chessComGameSource.js';
import { LichessRatingSource } from './rating/lichessRatingSource.js';
import { ChessComRatingSource } from './rating/chessComRatingSource.js';
import { StockfishNativeEngine } from './stockfish/nativeEngine.js';
import { GeminiFlashProvider } from './llm/geminiProvider.js';
import { DeepSeekProvider } from './llm/deepseekProvider.js';
import type { ResilienceOptions } from './llm/resilience.js';
import { PostHogAnalytics } from './analytics/posthogAnalytics.js';
import { ResendMailer } from './email/resendMailer.js';

export function createGameSource(env: Env): GameSource {
  switch (env.GAME_SOURCE) {
    case 'mock':
      return new MockGameSource();
    case 'lichess':
      return new LichessGameSource({ userAgent: env.LICHESS_USER_AGENT });
    case 'chesscom':
      return new ChessComGameSource({ userAgent: env.CHESSCOM_USER_AGENT });
  }
}

/**
 * Per-job live game source selection (plans/phase-2.md 2.1): users pick their
 * platform at signup, so the worker needs whichever source that job names.
 * When GAME_SOURCE=mock (dev/e2e), every request stays on the mock regardless
 * of the platform chosen.
 */
export function createGameSourceFor(env: Env, source: 'lichess' | 'chesscom'): GameSource {
  if (env.GAME_SOURCE === 'mock') return new MockGameSource();
  switch (source) {
    case 'lichess':
      return new LichessGameSource({ userAgent: env.LICHESS_USER_AGENT });
    case 'chesscom':
      return new ChessComGameSource({ userAgent: env.CHESSCOM_USER_AGENT });
  }
}

/**
 * Rating source selection (plans/phase-2.md 2.4). Same mock rule as game
 * sources: when GAME_SOURCE=mock (dev/e2e), every platform stays on the mock
 * so no dev run touches the real rating APIs.
 */
export function createRatingSourceFor(env: Env, source: 'lichess' | 'chesscom'): RatingSource {
  if (env.GAME_SOURCE === 'mock') return new MockRatingSource();
  switch (source) {
    case 'lichess':
      return new LichessRatingSource({ userAgent: env.LICHESS_USER_AGENT });
    case 'chesscom':
      return new ChessComRatingSource({ userAgent: env.CHESSCOM_USER_AGENT });
  }
}

export function createEngine(env: Env): ChessEngine {
  switch (env.ENGINE_KIND) {
    case 'mock':
      return new MockEngine();
    case 'native':
      if (!env.STOCKFISH_PATH) throw new Error('STOCKFISH_PATH is required for native engine');
      return new StockfishNativeEngine({
        binPath: env.STOCKFISH_PATH,
        poolSize: env.ENGINE_POOL_SIZE,
        threads: env.ENGINE_THREADS,
        hash: env.ENGINE_HASH,
      });
    case 'wasm':
      throw new Error('StockfishWasmEngine not yet implemented (fallback adapter)');
  }
}

/** Optional observability hooks. `onUsage` fires once per successful LLM call. */
export interface LlmHooks {
  onUsage?: ResilienceOptions['onUsage'];
}

export function createLlmProvider(env: Env, hooks: LlmHooks = {}): LlmProvider {
  switch (env.LLM_PROVIDER) {
    case 'mock':
      return new MockLlmProvider();
    case 'gemini':
      if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required for gemini provider');
      return new GeminiFlashProvider({
        apiKey: env.GEMINI_API_KEY,
        model: env.LLM_MODEL,
        ...(hooks.onUsage ? { onUsage: hooks.onUsage } : {}),
      });
    case 'deepseek':
      if (!env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY is required for deepseek provider');
      return new DeepSeekProvider({
        apiKey: env.DEEPSEEK_API_KEY,
        model: env.LLM_MODEL,
        thinking: env.DEEPSEEK_THINKING,
        ...(hooks.onUsage ? { onUsage: hooks.onUsage } : {}),
      });
  }
}

export function createAnalytics(env: Env): Analytics {
  switch (env.ANALYTICS_PROVIDER) {
    case 'mock':
      return new MockAnalytics();
    case 'posthog':
      if (!env.POSTHOG_KEY) throw new Error('POSTHOG_KEY is required for posthog analytics');
      return new PostHogAnalytics({ apiKey: env.POSTHOG_KEY, host: env.POSTHOG_HOST });
  }
}

export function createMailer(env: Env): Mailer {
  switch (env.MAILER_PROVIDER) {
    case 'mock':
      return new MockMailer();
    case 'resend':
      if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is required for resend mailer');
      return new ResendMailer({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
  }
}

// Billing (plans/phase-2.md 2.5 / D-P2-2): gateway deferred. Only the mock
// exists; future gateway adapters (stripe/paddle/…) slot in here by env.
export function createBilling(env: Env): Billing {
  switch (env.BILLING_PROVIDER) {
    case 'mock':
      return new MockBilling();
  }
}
