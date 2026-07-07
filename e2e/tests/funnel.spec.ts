import { test, expect } from '@playwright/test';

/**
 * Full funnel on mock adapters: landing → signup → analysis job → report →
 * fake-door interest click. Requires the web app + worker running against a
 * test Postgres with GAME_SOURCE/ENGINE_KIND/LLM_PROVIDER=mock.
 */
test('signup → report → interest', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  // Landing → fill signup
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByLabel('Your Lichess username').fill('mockuser');
  await page.getByLabel(/Email/).fill(email);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /free weakness report/i }).click();

  // Progress screen
  await expect(page).toHaveURL(/\/analyzing\//);
  await expect(page.getByText(/Analyzing your games/i)).toBeVisible();

  // Worker processes the job → auto-redirect to the report (allow a couple min)
  await page.waitForURL(/\/report\//, { timeout: 120_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Fake-door WTP click is recorded
  await page.getByRole('button', { name: /Notify me/i }).click();
  await expect(page.getByText(/weekly training plan is ready/i)).toBeVisible();
});
