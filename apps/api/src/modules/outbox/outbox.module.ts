import { Global, Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { OutboxController } from './outbox.controller';
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxService } from './outbox.service';

// Global: any module that changes state needs to record the side effects of
// that change in the same transaction, so OutboxService must be injectable
// everywhere without a web of imports.
//
// OutboxRelayService is provided here but only STARTED by the worker entry
// point — the HTTP process writes rows and never drains them.
@Global()
@Module({
  imports: [QueueModule],
  controllers: [OutboxController],
  providers: [OutboxService, OutboxRelayService],
  exports: [OutboxService, OutboxRelayService],
})
export class OutboxModule {}
