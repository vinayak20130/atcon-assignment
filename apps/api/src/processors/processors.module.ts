import { Module } from '@nestjs/common';
import { ParsingModule } from '../modules/parsing/parsing.module';
import { QueueModule } from '../modules/queue/queue.module';
import { ResumeParseProcessor } from './resume-parse.processor';

// Registered in the shared AppModule, so the HTTP process constructs them too.
// Harmless — a BullMQ worker only pulls jobs when its connection is live — and
// keeping one module graph means processors and controllers cannot drift onto
// different versions of the domain rules.
@Module({
  imports: [QueueModule, ParsingModule],
  providers: [ResumeParseProcessor],
})
export class ProcessorsModule {}
