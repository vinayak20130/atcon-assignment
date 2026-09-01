import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ModuleRef } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { APP_CONFIG } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import { PrismaService } from '../../prisma/services/prisma.service';
import { type QueueName, queueForEvent } from '../../queue/jobs';

interface LeasedEvent {
  id: string;
  org_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
}

/** How long a claimed event stays invisible to other relays before retrying. */
const LEASE_MS = 30_000;

// The read half of the transactional outbox. Runs only in the worker process,
// so scaling the API out does not multiply relays.
//
// Polling rather than logical-replication CDC is a deliberate trade: a one
// second tick is far below what a hiring pipeline notices, and it costs one
// indexed query instead of a replication slot, a decoding plugin, and an
// operational story for slot lag.
@Injectable()
export class OutboxRelayService implements OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer: NodeJS.Timeout | null = null;
  /** Queue instances, resolved on first use. */
  private readonly queues = new Map<QueueName, Queue>();
  private running = false;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: Env,
    private readonly moduleRef: ModuleRef,
  ) {}

  start(): void {
    if (this.timer) return;
    this.logger.log(`Outbox relay polling every ${this.config.OUTBOX_POLL_INTERVAL_MS}ms`);
    this.timer = setInterval(() => void this.tick(), this.config.OUTBOX_POLL_INTERVAL_MS);
    // Do not hold the event loop open purely to poll.
    this.timer.unref();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // Guarded by `running` so a slow batch cannot overlap the next tick. The
  // lease already makes concurrent relays safe across processes; this avoids
  // pointless duplicate work inside one.
  async tick(): Promise<number> {
    if (this.running || this.stopped) return 0;
    this.running = true;
    try {
      return await this.drainBatch();
    } catch (error) {
      this.logger.error({ err: error }, 'Outbox relay cycle failed');
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async drainBatch(): Promise<number> {
    const leased = await this.lease();
    if (leased.length === 0) return 0;

    let dispatched = 0;
    for (const event of leased) {
      const queue = this.queueFor(queueForEvent(event.event_type));

      if (!queue) {
        // An event type nobody routes. Failing it loudly beats having it
        // re-leased on every tick until the end of time.
        await this.markFailed(event.id, `No queue registered for "${event.event_type}"`);
        this.logger.error(`Outbox event ${event.id} has no route (${event.event_type})`);
        continue;
      }

      try {
        await queue.add(
          event.event_type,
          { eventId: event.id, orgId: event.org_id, ...event.payload },
          {
            // The outbox row id IS the job id. A row relayed twice — which the
            // lease permits, and at-least-once delivery guarantees will happen
            // eventually — collapses into a single BullMQ job rather than
            // doing the work twice.
            jobId: event.id,
          },
        );
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: 'DISPATCHED', dispatchedAt: new Date(), lastError: null },
        });
        dispatched += 1;
      } catch (error) {
        await this.recordFailure(event, error);
      }
    }

    return dispatched;
  }

  /**
   * Take a batch of due events on a time-limited lease.
   *
   * FOR UPDATE SKIP LOCKED makes this safe in more than one process: each relay
   * takes rows nobody else holds instead of blocking on them, so a second
   * worker adds throughput rather than contention.
   *
   * The lease — pushing available_at forward while leaving the row PENDING — is
   * what makes a crashed relay self-healing. If this process dies between
   * leasing and enqueuing, the row simply becomes visible again. Marking rows
   * DISPATCHED at claim time would strand them and need a separate reconciler
   * to find events that look handled but have no job.
   */
  private async lease(): Promise<LeasedEvent[]> {
    return this.prisma.$queryRaw<LeasedEvent[]>`
      WITH due AS (
        SELECT id FROM outbox_events
        WHERE status = 'PENDING' AND available_at <= now()
        ORDER BY available_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${this.config.OUTBOX_BATCH_SIZE}
      )
      UPDATE outbox_events o
      SET available_at = now() + ${`${LEASE_MS} milliseconds`}::interval
      FROM due
      WHERE o.id = due.id
      RETURNING o.id, o.org_id, o.event_type, o.payload, o.attempts
    `;
  }

  private async markFailed(id: string, reason: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { status: 'FAILED', lastError: reason.slice(0, 1000) },
    });
  }

  // Redis unreachable, or BullMQ refused the job. Backs off exponentially until
  // the attempt ceiling, after which the row becomes FAILED and visible in the
  // DLQ rather than retrying invisibly forever.
  private async recordFailure(event: LeasedEvent, error: unknown): Promise<void> {
    const attempts = event.attempts + 1;
    const message = error instanceof Error ? error.message : String(error);

    if (attempts >= this.config.JOB_MAX_ATTEMPTS) {
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'FAILED', attempts, lastError: message.slice(0, 1000) },
      });
      this.logger.error(`Outbox event ${event.id} exhausted relay attempts`);
      return;
    }

    await this.prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        attempts,
        availableAt: new Date(Date.now() + Math.min(2 ** attempts * 1000, 60_000)),
        lastError: message.slice(0, 1000),
      },
    });
  }

  /**
   * Resolve a queue by name, rather than by a hand-maintained switch.
   *
   * The routing table is meant to be the single place a new event type is
   * declared. It was not: every queue also had to be injected here and added to
   * a switch, so a routed event with no matching case failed as "no queue
   * registered" — the table said yes and the relay said no. Looking the queue
   * up through the container removes the second list entirely.
   */
  private queueFor(name: QueueName | null): Queue | null {
    if (!name) return null;

    const cached = this.queues.get(name);
    if (cached) return cached;

    // strict:false because the queue providers are registered in QueueModule,
    // not this one.
    const queue = this.moduleRef.get<Queue>(getQueueToken(name), { strict: false });
    if (!queue) return null;

    this.queues.set(name, queue);
    return queue;
  }

  /** Return a FAILED event to the queue. Backs the DLQ replay endpoint. */
  async replay(eventId: string): Promise<boolean> {
    const updated = await this.prisma.outboxEvent.updateMany({
      where: { id: eventId, status: 'FAILED' },
      data: { status: 'PENDING', attempts: 0, availableAt: new Date(), lastError: null },
    });
    return updated.count > 0;
  }
}
