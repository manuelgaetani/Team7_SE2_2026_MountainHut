import { expect, test } from '@playwright/test';

test('home page loads and reaches the API', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Mountain Hut');
  await expect(page.getByText('API status: ok')).toBeVisible();
});
