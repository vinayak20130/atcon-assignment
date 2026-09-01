import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../modules/prisma/services/prisma.service';
import { NotificationsService } from '../modules/notifications/services/notifications.service';
import { QUEUE, type NotificationJob } from '../modules/queue/jobs';

/**
 * Send the email an outbox event asks for.
 *
 * One processor for every notification: the event type selects a template, so
 * adding a notification never means adding a consumer. What arrives here has
 * already been committed alongside the state change that caused it, which is
 * the property the outbox exists to provide — no email about an application
 * that was rolled back, and none silently lost because the send failed.
 */
@Processor(QUEUE.NOTIFICATION_SEND)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<NotificationJob>): Promise<{ status: string }> {
    // The originating outbox row carries the event type. Reading it here rather
    // than copying it into the payload keeps one source of truth for what this
    // job is about.
    const event = await this.prisma.outboxEvent.findUnique({
      where: { id: job.data.eventId },
      select: { eventType: true },
    });

    if (!event) {
      this.logger.warn(`Outbox event ${job.data.eventId} is gone; dropping`);
      return { status: 'orphaned' };
    }

    const result = await this.notifications.deliver(event.eventType, {
      applicationId: job.data.applicationId,
      interviewId: job.data.interviewId,
    });

    return { status: result.status };
  }
}
