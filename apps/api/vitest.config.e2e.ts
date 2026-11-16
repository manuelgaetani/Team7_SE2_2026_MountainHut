import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    env: {
      JWT_SECRET: 'test-secret-only-for-e2e',
      DATABASE_URL: 'postgresql://user:password@localhost:5432/e2e_unused',
    },
  },
});
