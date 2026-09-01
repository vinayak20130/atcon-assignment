import { z } from 'zod';

const port = z.coerce.number().int().positive();

export type DurationString =
  `${number}s` | `${number}m` | `${number}h` | `${number}d`;

const duration = z
  .string()
  .regex(/^\d+[smhd]$/, 'expected a duration like 15m or 7d')
  .transform((value) => value as DurationString);

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  /** Where uploaded documents live. Relative to the repo root. */
  STORAGE_ROOT: z.string().default('./storage'),

  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().default(50),
  JOB_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: duration.default('15m'),
  JWT_REFRESH_TTL: duration.default('7d'),

  API_PORT: port.default(4000),
  API_PUBLIC_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
