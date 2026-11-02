import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Same .env as prisma.config.ts. In CI the variables come from the environment instead.
config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });
config({ path: '../../.env', quiet: true });

const TEST_SUFFIX = '_test';

const databaseName = (url: URL): string => decodeURIComponent(url.pathname.slice(1));

// The integration tests use their own database next to the development one, so they can empty
// it freely: same server and credentials, with "_test" added to the database name.
export function testDatabaseUrl(): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is not defined');
  const url = new URL(base);
  const name = databaseName(url);
  if (!name.endsWith(TEST_SUFFIX)) url.pathname = `/${name}${TEST_SUFFIX}`;
  return url.toString();
}

// Stops anything destructive from running on a database that is not a test database.
export function assertTestDatabase(connectionString: string | undefined): string {
  if (!connectionString) throw new Error('DATABASE_URL is not defined');
  const name = databaseName(new URL(connectionString));
  if (!/^[a-z0-9_]+$/.test(name) || !name.endsWith(TEST_SUFFIX)) {
    throw new Error(`Refusing to use "${name}": integration tests only run on a *_test database`);
  }
  return name;
}
