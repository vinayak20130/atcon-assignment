import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { QueueModule } from './modules/queue/queue.module';
import { ProcessorsModule } from './processors/processors.module';
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
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    QueueModule,
    StorageModule,
    ParsingModule,
    IdempotencyModule,
    AuthModule,
    UsersModule,
    JobsModule,
    ApplicationsModule,
    CandidatesModule,
    InterviewsModule,
    AnalyticsModule,
    NotificationsModule,
    OutboxModule,
    ProcessorsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    // Authentication is global and opt-out: a route added without @Public()
    // is protected by default, so forgetting a decorator locks an endpoint
    // rather than exposing one.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Order is load-bearing: RolesGuard reads the user that JwtAuthGuard
    // puts on the request, so it must run second.
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
