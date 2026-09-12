export * from './factory.js';

// Real adapters (also exported directly for tests + explicit wiring)
export { LichessGameSource, type LichessOptions } from './lichess/lichessGameSource.js';
export { ChessComGameSource, parseClocksCs } from './chesscom/chessComGameSource.js';
export { LichessRatingSource, type LichessRatingOptions } from './rating/lichessRatingSource.js';
export { ChessComRatingSource, type ChessComRatingOptions } from './rating/chessComRatingSource.js';
export { StockfishNativeEngine, type StockfishNativeOptions } from './stockfish/nativeEngine.js';
export { GeminiFlashProvider, type GeminiOptions } from './llm/geminiProvider.js';
export { DeepSeekProvider, type DeepSeekOptions } from './llm/deepseekProvider.js';
export { PostHogAnalytics, type PostHogOptions } from './analytics/posthogAnalytics.js';
export { ResendMailer, type ResendOptions } from './email/resendMailer.js';

// Mocks (exported for tests + the Phase B vertical slice)
export { MockGameSource } from './mocks/mockGameSource.js';
export { MockRatingSource } from './mocks/mockRatingSource.js';
export { MockEngine } from './mocks/mockEngine.js';
export { MockLlmProvider } from './mocks/mockLlm.js';
export { MockAnalytics, type CapturedEvent } from './mocks/mockAnalytics.js';
export { MockMailer } from './mocks/mockMailer.js';
export { MockBilling } from './billing/mockBilling.js';
export { MOCK_GAMES } from './mocks/fixtures.js';
