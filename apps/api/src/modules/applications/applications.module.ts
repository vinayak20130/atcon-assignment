import { Module } from '@nestjs/common';
import { JobScopeService } from '../auth/services/job-scope.service';
import { ApplicationIntakeService } from './services/application-intake.service';
import { ApplicationsController } from './controllers/applications.controller';
import { PipelineService } from './services/pipeline.service';
import { PublicApplicationsController } from './controllers/public-applications.controller';

@Module({
  controllers: [PublicApplicationsController, ApplicationsController],
  providers: [ApplicationIntakeService, PipelineService, JobScopeService],
  exports: [ApplicationIntakeService, PipelineService],
})
export class ApplicationsModule {}
