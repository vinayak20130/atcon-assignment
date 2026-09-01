import { Module } from '@nestjs/common';
import { JobScopeService } from '../auth/job-scope.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ApplicationInterviewsController, InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';
import { ScorecardsService } from './scorecards.service';

@Module({
  imports: [PrismaModule],
  controllers: [InterviewsController, ApplicationInterviewsController],
  providers: [InterviewsService, ScorecardsService, JobScopeService],
  exports: [InterviewsService],
})
export class InterviewsModule {}
