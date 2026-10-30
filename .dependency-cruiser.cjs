// Architecture rules checked in CI (npm run depcruise).
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular imports make modules hard to test and to change on their own.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'The import does not resolve to a file or an installed package.',
      from: {},
      // supertest/types.js exists only in @types/supertest; tsc resolves and checks it
      to: { couldNotResolve: true, pathNot: '^supertest/types\\.js$' },
    },
    {
      name: 'no-undeclared-dependency',
      severity: 'error',
      comment: 'Packages must be listed in the package.json of the workspace that imports them.',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'no-dev-dependency-in-production-code',
      severity: 'error',
      comment:
        'Production code cannot rely on devDependencies: they are not installed in the Docker image.',
      from: { path: '^(apps|packages)/[^/]+/src', pathNot: '\\.(spec|test)\\.tsx?$|/test/' },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'no-production-code-to-tests',
      severity: 'error',
      comment: 'Production code must not import test files or test helpers.',
      from: { pathNot: '\\.(spec|test|e2e-spec)\\.tsx?$|/test/|^e2e/' },
      to: { path: '\\.(spec|test|e2e-spec)\\.tsx?$|/test/' },
    },
    {
      name: 'apps-are-independent',
      severity: 'error',
      comment: 'api and web talk over HTTP; shared code goes in packages/shared.',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
    {
      name: 'shared-does-not-depend-on-apps',
      severity: 'error',
      comment:
        'packages/shared is used by every app, so it cannot import from them or from the e2e tests.',
      from: { path: '^packages/' },
      to: { path: '^(apps|e2e)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage|node_modules)/|^apps/api/src/generated/' },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },
  },
};
