import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UnprocessableEntityException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { type AuthenticatedUser, UserRole } from '@atcon/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE } from '../queue/jobs';
import { OutboxRelayService } from './outbox-relay.service';

// Operational surface for the async pipeline.
//
// Two independent failure modes, and both need to be inspectable or the
// reliability story has a hole:
//
//   - the relay could not hand an event to Redis  -> outbox_events FAILED
//   - the job reached a worker and kept throwing  -> BullMQ failed set
//
// Being able to answer "what broke, and can we re-run it?" without a psql
// session is the difference between a pipeline you can operate and one you can
// only hope about.
@Roles(UserRole.RECRUITER)
@Controller({ path: 'admin', version: '1' })
export class OutboxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relay: OutboxRelayService,
    @InjectQueue(QUEUE.RESUME_PARSE) private readonly resumeParse: Queue,
  ) {}

  @Get('outbox')
  async listOutbox(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    const allowed = ['PENDING', 'DISPATCHED', 'FAILED'] as const;
    const filter = allowed.find((value) => value === status?.toUpperCase());

    const data = await this.prisma.outboxEvent.findMany({
      where: { orgId: user.orgId, ...(filter ? { status: filter } : {}) },
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

  @Post('outbox/:id/replay')
  @HttpCode(HttpStatus.ACCEPTED)
  async replayOutbox(@Param('id') id: string) {
    if (!(await this.relay.replay(id))) {
      throw new UnprocessableEntityException(
        'No FAILED outbox event with that id. Only failed events can be replayed.',
      );
    }
    return { id, status: 'PENDING' };
  }

  @Get('dead-letter')
  async deadLetter() {
    const failed = await this.resumeParse.getFailed(0, 49);
    return {
      data: failed.map((job) => ({
        queue: QUEUE.RESUME_PARSE,
        jobId: String(job.id),
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason ?? 'unknown',
        // Only the first frames: enough to identify the fault without
        // returning an unbounded blob to an HTTP client.
        stacktrace: (job.stacktrace ?? []).slice(0, 3),
        failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      })),
      count: failed.length,
    };
  }

  @Post('dead-letter/:jobId/replay')
  @HttpCode(HttpStatus.ACCEPTED)
  async replayJob(@Param('jobId') jobId: string) {
    const job = await this.resumeParse.getJob(jobId);
    // retry() reuses the original job id, so replaying one that has since
    // succeeded by another route cannot create a duplicate.
    if (!job || (await job.getState()) !== 'failed') {
      throw new UnprocessableEntityException(
        'That job is not in the failed set. It may have already been replayed.',
      );
    }
    await job.retry();
    return { jobId, status: 'requeued' };
  }
}
