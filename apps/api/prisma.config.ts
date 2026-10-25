import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Load the repository-level .env during local development.
// In Docker the variables come from the container environment instead.
config({ path: '../../.env', quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
