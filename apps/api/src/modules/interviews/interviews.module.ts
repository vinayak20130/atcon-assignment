import { Module } from '@nestjs/common';
import { JobScopeService } from '../auth/services/job-scope.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ApplicationInterviewsController, InterviewsController } from './controllers/interviews.controller';
import { InterviewsService } from './services/interviews.service';
import { ScorecardsService } from './services/scorecards.service';

@Module({
  imports: [PrismaModule],
  controllers: [InterviewsController, ApplicationInterviewsController],
  providers: [InterviewsService, ScorecardsService, JobScopeService],
  exports: [InterviewsService],
})
export class InterviewsModule {}
