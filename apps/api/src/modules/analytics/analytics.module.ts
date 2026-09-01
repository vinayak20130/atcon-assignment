import { Module } from '@nestjs/common';
import { JobScopeService } from '../auth/services/job-scope.service';
import { AnalyticsController } from './controllers/analytics.controller';
import { AnalyticsService } from './services/analytics.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, JobScopeService],
})
export class AnalyticsModule {}
