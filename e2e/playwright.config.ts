import { defineConfig, devices } from '@playwright/test';

// Runs against an already running system, e.g. `docker compose up`.
// Override the target with E2E_BASE_URL.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
