import { Module } from '@nestjs/common';
import { JobScopeService } from '../auth/job-scope.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, JobScopeService],
})
export class AnalyticsModule {}
