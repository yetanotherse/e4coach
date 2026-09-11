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
export * from './prompts/explain.js';
export * from './prompts/plan.js';

// Weekly training plans (plans/phase-2.md 2.2a)
export * from './plan/index.js';

// Accountability loop: streaks + check-ins (plans/phase-2.md 2.4)
export * from './accountability.js';
