import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/**/*.{test,spec}.ts',
      'apps/worker/**/*.{test,spec}.ts',
      'apps/web/**/*.{test,spec}.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**'],
      exclude: [
        // Type-only declarations and barrels have no executable code.
        'packages/core/src/ports/**',
        'packages/core/src/types.ts',
        'packages/core/src/report.ts',
        'packages/core/src/profile.ts',
        'packages/core/src/test/**',
        '**/index.ts',
        '**/*.test.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
