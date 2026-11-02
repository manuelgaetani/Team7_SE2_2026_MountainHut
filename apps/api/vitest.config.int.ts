import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Integration tests: the API code against a real PostgreSQL database, a separate "*_test"
// database created by test/integration/global-setup.ts. Needs `docker compose up -d db`.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.int-spec.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
    setupFiles: ['test/integration/setup-env.ts'],
    // Every test file empties the same database, so the files must not run in parallel.
    fileParallelism: false,
    env: {
      BOOKING_TIMEZONE: 'Europe/Rome',
    },
  },
});
