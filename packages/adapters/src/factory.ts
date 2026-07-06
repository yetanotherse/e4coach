/**
 * Provider selection (spec §8, §16). Domain/pipeline code asks the factory for
 * a port implementation; the concrete vendor is chosen by env. Real adapters
 * (lichess/native/gemini/posthog/resend) are added in Phase C/D — until then
 * the factory falls back to the mock and logs a warning so nothing silently
 * breaks.
 */
import type { Env } from '@chess-coach/config';
import type { Analytics, ChessEngine, GameSource, LlmProvider, Mailer } from '@chess-coach/core';

import { MockGameSource } from './mocks/mockGameSource.js';
import { MockEngine } from './mocks/mockEngine.js';
import { MockLlmProvider } from './mocks/mockLlm.js';
import { MockAnalytics } from './mocks/mockAnalytics.js';
import { MockMailer } from './mocks/mockMailer.js';

export function createGameSource(env: Env): GameSource {
  switch (env.GAME_SOURCE) {
    case 'mock':
      return new MockGameSource();
    case 'lichess':
      // Phase C: return new LichessGameSource({ userAgent: env.LICHESS_USER_AGENT });
      throw new Error('LichessGameSource not yet implemented (Phase C)');
  }
}

export function createEngine(env: Env): ChessEngine {
  switch (env.ENGINE_KIND) {
    case 'mock':
      return new MockEngine();
    case 'native':
    case 'wasm':
      throw new Error(`Stockfish (${env.ENGINE_KIND}) engine not yet implemented (Phase C)`);
  }
}

export function createLlmProvider(env: Env): LlmProvider {
  switch (env.LLM_PROVIDER) {
    case 'mock':
      return new MockLlmProvider();
    case 'gemini':
      throw new Error('GeminiFlashProvider not yet implemented (Phase C)');
  }
}

export function createAnalytics(env: Env): Analytics {
  switch (env.ANALYTICS_PROVIDER) {
    case 'mock':
      return new MockAnalytics();
    case 'posthog':
      throw new Error('PostHogAnalytics not yet implemented (Phase D)');
  }
}

export function createMailer(env: Env): Mailer {
  switch (env.MAILER_PROVIDER) {
    case 'mock':
      return new MockMailer();
    case 'resend':
      throw new Error('ResendMailer not yet implemented (Phase D)');
  }
}
