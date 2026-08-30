import { Module } from '@nestjs/common';
import { CandidatesService } from './candidates.service';
import { CandidatesController } from './candidates.controller';

@Module({
  providers: [CandidatesService],
  controllers: [CandidatesController]
})
export class CandidatesModule {}
