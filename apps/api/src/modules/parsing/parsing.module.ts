import { Module } from '@nestjs/common';
import { HeuristicResumeParser, ResumeParser } from './resume-parser';

// Bound to the abstract class rather than injected concretely, so swapping in a
// vendor or LLM implementation is a one-line change here and nothing else
// notices.
@Module({
  providers: [{ provide: ResumeParser, useClass: HeuristicResumeParser }],
  exports: [ResumeParser],
})
export class ParsingModule {}
