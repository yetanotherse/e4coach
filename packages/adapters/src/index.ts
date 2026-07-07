export * from './factory.js';

// Real adapters (also exported directly for tests + explicit wiring)
export { LichessGameSource, type LichessOptions } from './lichess/lichessGameSource.js';
export { StockfishNativeEngine, type StockfishNativeOptions } from './stockfish/nativeEngine.js';
export { GeminiFlashProvider, type GeminiOptions } from './llm/geminiProvider.js';

// Mocks (exported for tests + the Phase B vertical slice)
export { MockGameSource } from './mocks/mockGameSource.js';
export { MockEngine } from './mocks/mockEngine.js';
export { MockLlmProvider } from './mocks/mockLlm.js';
export { MockAnalytics, type CapturedEvent } from './mocks/mockAnalytics.js';
export { MockMailer } from './mocks/mockMailer.js';
export { MOCK_GAMES } from './mocks/fixtures.js';
