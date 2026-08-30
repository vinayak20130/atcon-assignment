import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './modules/prisma/prisma.module';
import { QueueModule } from './modules/queue/queue.module';
import { StorageModule } from './modules/storage/storage.module';
import { ParsingModule } from './modules/parsing/parsing.module';
import { IdempotencyModule } from './modules/idempotency/idempotency.module';
import { AuthModule } from './modules/auth/auth.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { CandidatesModule } from './modules/candidates/candidates.module';
import { InterviewsModule } from './modules/interviews/interviews.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { HealthController } from './modules/health.controller';

@Module({
  imports: [
    PrismaModule,
    QueueModule,
    StorageModule,
    ParsingModule,
    IdempotencyModule,
    AuthModule,
    JobsModule,
    ApplicationsModule,
    CandidatesModule,
    InterviewsModule,
    AnalyticsModule,
    NotificationsModule,
    OutboxModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
