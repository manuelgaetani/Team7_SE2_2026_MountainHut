import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// emitDecoratorMetadata generates `typeof X === "undefined" ? Object : X` for every injected
// class. X is always defined, so no test can reach that branch of the generated code.
const stripDecoratorMetadataBranch = {
  name: 'strip-decorator-metadata-branch',
  enforce: 'post' as const,
  transform(code: string, id: string) {
    if (!id.includes('/src/')) return null;
    return {
      code: code.replace(/typeof (\w+) === "undefined" \? Object : \1/g, '$1'),
      map: null,
    };
  },
};

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths(), stripDecoratorMetadataBranch],
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/generated/**', 'src/**/*.spec.ts'],
    },
  },
});
