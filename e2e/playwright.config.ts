import { defineConfig, devices } from '@playwright/test';

// Runs against an already running system, e.g. `docker compose up`.
// Override the target with E2E_BASE_URL.
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // A leftover test.only must not silently skip the rest of the suite in CI.
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // HTTP calls only, no browser.
    { name: 'api', testDir: './tests/api' },
    // Pages driven in a real browser.
    { name: 'web', testDir: './tests/web', use: { ...devices['Desktop Chrome'] } },
  ],
});
