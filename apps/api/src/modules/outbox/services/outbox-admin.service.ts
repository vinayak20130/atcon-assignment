import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ModuleRef } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { ALL_QUEUES, type QueueName } from '../../queue/jobs';
import { PrismaService } from '../../prisma/services/prisma.service';
import { OutboxRelayService } from './outbox-relay.service';

const OUTBOX_STATUSES = ['PENDING', 'DISPATCHED', 'FAILED'] as const;

/**
 * The operational view of the async pipeline.
 *
 * Two independent failure modes, and both have to be inspectable or the
 * reliability story has a hole:
 *
 *   - the relay could not hand an event to Redis  -> outbox_events FAILED
 *   - the job reached a worker and kept throwing  -> BullMQ failed set
 *
 * Answering "what broke, and can we re-run it?" without a psql session is the
 * difference between a pipeline you can operate and one you can only hope
 * about.
 */
@Injectable()
export class OutboxAdminService {
  private readonly queues = new Map<QueueName, Queue>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly relay: OutboxRelayService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async listEvents(orgId: string, status?: string) {
    const filter = OUTBOX_STATUSES.find((value) => value === status?.toUpperCase());

    const data = await this.prisma.outboxEvent.findMany({
      where: { orgId, ...(filter ? { status: filter } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        aggregateType: true,
        eventType: true,
        status: true,
        attempts: true,
        dispatchedAt: true,
        lastError: true,
        createdAt: true,
      },
    });

    return { data, count: data.length };
  }

  async replayEvent(id: string) {
    if (!(await this.relay.replay(id))) {
      throw new UnprocessableEntityException(
        'No FAILED outbox event with that id. Only failed events can be replayed.',
      );
    }
    return { id, status: 'PENDING' as const };
  }

  /**
   * Failed jobs across every queue.
   *
   * Every queue, not just the first one: this endpoint previously inspected
   * resume parsing alone, so a notification that failed five times left no
   * trace anywhere an operator would look. A dead-letter view that covers some
   * of the queues is worse than none, because it reads as "nothing is broken".
   */
  async deadLetter() {
    const data: Array<Record<string, unknown>> = [];

    for (const name of ALL_QUEUES) {
      const queue = this.queueFor(name);
      if (!queue) continue;

      for (const job of await queue.getFailed(0, 49)) {
        data.push({
          queue: name,
          jobId: String(job.id),
          attemptsMade: job.attemptsMade,
          failedReason: job.failedReason ?? 'unknown',
          // Only the first frames: enough to identify the fault without
          // returning an unbounded blob to an HTTP client.
          stacktrace: (job.stacktrace ?? []).slice(0, 3),
          failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
        });
      }
    }

    return { data, count: data.length };
  }

  async replayJob(queueName: string, jobId: string) {
    const name = ALL_QUEUES.find((value) => value === queueName);
    if (!name) throw new UnprocessableEntityException(`Unknown queue "${queueName}".`);

    const queue = this.queueFor(name);
    const job = await queue?.getJob(jobId);

    // retry() reuses the original job id, so replaying one that has since
    // succeeded by another route cannot create a duplicate.
    if (!job || (await job.getState()) !== 'failed') {
      throw new UnprocessableEntityException(
        'That job is not in the failed set. It may have already been replayed.',
      );
    }

    await job.retry();
    return { queue: name, jobId, status: 'requeued' as const };
  }

  private queueFor(name: QueueName): Queue | null {
    const cached = this.queues.get(name);
    if (cached) return cached;

    const queue = this.moduleRef.get<Queue>(getQueueToken(name), { strict: false });
    if (!queue) return null;

    this.queues.set(name, queue);
    return queue;
  }
}
