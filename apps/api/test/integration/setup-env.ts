import { testDatabaseUrl } from './test-database.js';

// Runs in every test worker before the test files: the code under test (PrismaService) reads
// DATABASE_URL, so it must point to the test database.
process.env.DATABASE_URL = testDatabaseUrl();
