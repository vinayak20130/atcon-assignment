import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { type AuthenticatedUser, UserRole } from '@atcon/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { OutboxAdminService } from '../services/outbox-admin.service';

// Operational surface for the async pipeline: what failed, and re-run it.
@Roles(UserRole.RECRUITER)
@Controller({ path: 'admin', version: '1' })
export class OutboxController {
  constructor(private readonly admin: OutboxAdminService) {}

  @Get('outbox')
  listOutbox(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: string) {
    return this.admin.listEvents(user.orgId, status);
  }

  @Post('outbox/:id/replay')
  @HttpCode(HttpStatus.ACCEPTED)
  replayOutbox(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.replayEvent(id);
  }

  @Get('dead-letter')
  deadLetter() {
    return this.admin.deadLetter();
  }

  // The queue is part of the address now that more than one exists.
  @Post('dead-letter/:queue/:jobId/replay')
  @HttpCode(HttpStatus.ACCEPTED)
  replayJob(@Param('queue') queue: string, @Param('jobId') jobId: string) {
    return this.admin.replayJob(queue, jobId);
  }
}
