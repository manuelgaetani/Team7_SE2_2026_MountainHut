import { expect, test } from '@playwright/test';

// The API itself is checked by tests/api/health.spec.ts.
test('home page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Mountain Hut');
  await expect(page.getByRole('heading', { name: 'Essential information' })).toBeVisible();
});
