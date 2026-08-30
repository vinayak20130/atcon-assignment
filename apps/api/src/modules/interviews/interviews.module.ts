import { Module } from '@nestjs/common';
import { InterviewsService } from './interviews.service';
import { InterviewsController } from './interviews.controller';

@Module({
  providers: [InterviewsService],
  controllers: [InterviewsController]
})
export class InterviewsModule {}
