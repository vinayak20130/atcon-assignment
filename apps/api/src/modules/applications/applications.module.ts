import { Module } from '@nestjs/common';
import { JobScopeService } from '../auth/services/job-scope.service';
import { ApplicationIntakeService } from './services/application-intake.service';
import { ApplicationsController } from './controllers/applications.controller';
import { ApplicationsService } from './services/applications.service';
import { PipelineService } from './services/pipeline.service';
import { PublicApplicationsController } from './controllers/public-applications.controller';

@Module({
  controllers: [PublicApplicationsController, ApplicationsController],
  providers: [ApplicationsService, ApplicationIntakeService, PipelineService, JobScopeService],
  exports: [ApplicationsService, ApplicationIntakeService, PipelineService],
})
export class ApplicationsModule {}
