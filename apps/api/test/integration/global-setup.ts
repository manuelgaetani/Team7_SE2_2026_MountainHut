import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { assertTestDatabase, testDatabaseUrl } from './test-database.js';

const apiRoot = fileURLToPath(new URL('../..', import.meta.url));

// Runs once before all integration tests: creates the test database if it does not exist yet
// and applies the migrations, exactly as `prisma migrate deploy` does in production.
export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  const name = assertTestDatabase(url);

  const server = new URL(url);
  server.pathname = '/postgres';
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: server.toString() }),
  });
  try {
    const rows = await admin.$queryRaw<{ found: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${name}) AS found`;
    // The name is checked by assertTestDatabase: only lowercase letters, digits and "_".
    if (!rows[0]?.found) await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
