import { Injectable } from '@nestjs/common';
import type { Prisma } from '@atcon/db';

export interface OutboxWrite {
  orgId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

// The write half of the transactional outbox.
//
// `tx` is required, not optional. Making the transaction an explicit parameter
// means an outbox write outside a transaction is a compile error rather than a
// subtle correctness bug discovered in production.
@Injectable()
export class OutboxService {
  async write(tx: Prisma.TransactionClient, event: OutboxWrite): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        orgId: event.orgId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload: event.payload as Prisma.InputJsonValue,
      },
    });
  }
}
