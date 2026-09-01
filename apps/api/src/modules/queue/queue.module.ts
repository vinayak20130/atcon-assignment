import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { APP_CONFIG } from '../../config/config.module';
import type { Env } from '../../config/env';
import { ALL_QUEUES } from './jobs';

// The retry policy lives here rather than on each producer, so every queue
// fails the same way: N attempts with exponential backoff, then the job lands
// in BullMQ's failed set, which is what the DLQ endpoints read.
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: Env) => ({
        connection: {
          url: config.REDIS_URL,
          // BullMQ requires null: a blocking command that gave up mid-wait
          // would drop a job the worker had already reserved.
          maxRetriesPerRequest: null,
        },
        defaultJobOptions: {
          attempts: config.JOB_MAX_ATTEMPTS,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { count: 1000 },
          // Failures are never auto-removed. A job nobody can inspect is a job
          // nobody can fix.
          removeOnFail: false,
        },
      }),
    }),
    ...ALL_QUEUES.map((name) => BullModule.registerQueue({ name })),
  ],
  exports: [BullModule],
})
export class QueueModule {}
