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
      name: 'bookings-not-to-notifications',
      severity: 'error',
      comment:
        'Bookings send their confirmation through the BookingConfirmationNotifier port: only the notifications module knows about emails. The Nest module that wires the two together is the one exception.',
      from: {
        path: '^apps/api/src/bookings/',
        pathNot: '\\.(spec|test)\\.tsx?$|^apps/api/src/bookings/bookings\\.module\\.ts$',
      },
      to: { path: '^apps/api/src/notifications/' },
    },
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment:
        'The domain layer holds plain business rules: no framework, database, mail or crypto libraries, no config, and no outer layers.',
      from: { path: '^apps/api/src/[^/]+/domain/', pathNot: '\\.(spec|int-spec)\\.ts$' },
      to: {
        path: [
          'node_modules/@nestjs/',
          'generated/prisma',
          'node_modules/(@types/)?express/',
          'node_modules/(@types/)?nodemailer/',
          'node_modules/(@types/)?bcrypt/',
          '^(node:)?crypto$',
          '/(application|infrastructure|presentation)/',
          '^apps/api/src/config/',
        ],
      },
    },
    {
      name: 'application-not-to-infra',
      severity: 'error',
      comment:
        'Use cases depend on ports, not on adapters: no infrastructure, presentation, database, mail, crypto or framework packages (only @nestjs/common is allowed).',
      from: { path: '^apps/api/src/[^/]+/application/', pathNot: '\\.(spec|int-spec)\\.ts$' },
      to: {
        path: [
          '/(infrastructure|presentation)/',
          'generated/prisma',
          'node_modules/(@types/)?express/',
          'node_modules/(@types/)?nodemailer/',
          'node_modules/(@types/)?bcrypt/',
          'node_modules/@nestjs/(?!common/)',
          '^(node:)?crypto$',
        ],
      },
    },
    {
      name: 'presentation-not-to-infra',
      severity: 'error',
      comment: 'Presentation talks to use cases, never directly to infrastructure adapters.',
      from: {
        path: '^apps/api/src/(presentation|[^/]+/presentation)/',
        pathNot: '\\.(spec|int-spec)\\.ts$',
      },
      to: { path: '/infrastructure/' },
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
    doNotFollow: { path: 'node_modules|^apps/api/src/generated/' },
    // node_modules and generated Prisma code are not excluded (only not followed) so layer rules can see imports of them
    exclude: { path: '^(apps|packages)/[^/]+/(dist|coverage)/|^(dist|coverage)/' },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },
  },
};
