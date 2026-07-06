export * from './factory.js';

// Mocks (exported for tests + the Phase B vertical slice)
export { MockGameSource } from './mocks/mockGameSource.js';
export { MockEngine } from './mocks/mockEngine.js';
export { MockLlmProvider } from './mocks/mockLlm.js';
export { MockAnalytics, type CapturedEvent } from './mocks/mockAnalytics.js';
export { MockMailer } from './mocks/mockMailer.js';
export { MOCK_GAMES } from './mocks/fixtures.js';
