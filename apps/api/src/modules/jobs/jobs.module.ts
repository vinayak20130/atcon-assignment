import { Module } from '@nestjs/common';
import { JobScopeService } from '../auth/job-scope.service';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  controllers: [JobsController],
  providers: [JobsService, JobScopeService],
  exports: [JobsService, JobScopeService],
})
export class JobsModule {}
