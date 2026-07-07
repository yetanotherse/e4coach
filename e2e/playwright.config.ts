import { defineConfig, devices } from '@playwright/test';

/**
 * Funnel e2e (spec §14.14). Runs against a live stack (web + worker + Postgres)
 * with all provider adapters set to `mock` so no external services are hit.
 * Point BASE_URL at the running web app.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
