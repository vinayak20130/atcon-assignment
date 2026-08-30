import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// This package is ESM ("type": "module"), where __dirname does not exist.
// import.meta.dirname is the equivalent (Node 20.11+).
const here = import.meta.dirname;

// The whole monorepo reads one .env at the repo root, so the API and the Prisma
// CLI cannot drift onto different databases. This must run before env() below.
loadEnv({ path: path.resolve(here, '../../.env'), quiet: true });

export default defineConfig({
  schema: path.join(here, 'prisma', 'schema.prisma'),
  // Prisma 7 removed `url` from the schema's datasource block; the connection
  // string for Migrate and Studio lives here instead.
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: path.join(here, 'prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
