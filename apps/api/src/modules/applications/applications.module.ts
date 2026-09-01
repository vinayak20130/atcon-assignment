import { Module } from '@nestjs/common';
import { JobScopeService } from '../auth/job-scope.service';
import { ApplicationIntakeService } from './application-intake.service';
import { ApplicationsController } from './applications.controller';
import { PipelineService } from './pipeline.service';
import { PublicApplicationsController } from './public-applications.controller';

@Module({
  controllers: [PublicApplicationsController, ApplicationsController],
  providers: [ApplicationIntakeService, PipelineService, JobScopeService],
  exports: [ApplicationIntakeService, PipelineService],
})
export class ApplicationsModule {}
