import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';


const here = import.meta.dirname;


loadEnv({ path: path.resolve(here, '../../.env'), quiet: true });

export default defineConfig({
  schema: path.join(here, 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join(here, 'prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
