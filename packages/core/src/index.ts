// Domain types
export * from './types.js';
export * from './taxonomy.js';
export * from './profile.js';

// Adapter ports (interfaces only — implementations live in @chess-coach/adapters)
export * from './ports/index.js';

// Report content shape (rendered report the web app displays)
export * from './report.js';

// Analysis engine (parse → score → aggregate → render) and detectors
export * from './analysis/index.js';
export * from './detectors/index.js';

// Report generation prompt + grounding contract
export * from './prompts/report.js';
