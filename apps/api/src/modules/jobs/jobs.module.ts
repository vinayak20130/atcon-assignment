import { Module } from '@nestjs/common';
import { JobScopeService } from '../auth/services/job-scope.service';
import { JobsController } from './controllers/jobs.controller';
import { PublicJobsController } from './controllers/public-jobs.controller';
import { JobsService } from './services/jobs.service';

@Module({
  controllers: [PublicJobsController, JobsController],
  providers: [JobsService, JobScopeService],
  exports: [JobsService, JobScopeService],
})
export class JobsModule {}
