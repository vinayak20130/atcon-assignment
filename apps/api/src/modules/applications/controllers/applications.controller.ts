import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { type AuthenticatedUser, UserRole } from '@atcon/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ApplicationsService } from '../services/applications.service';
import { PipelineService } from '../services/pipeline.service';

const transitionSchema = z.object({
  // The caller's view of the current stage. Sending it is what turns a stale
  // board into a clean 409 rather than a silent overwrite.
  fromStageId: z.string().uuid(),
  toStageId: z.string().uuid(),
  reason: z.string().trim().max(2000).optional(),
});

const listQuerySchema = z.object({
  jobId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'HIRED', 'REJECTED', 'WITHDRAWN']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

@Roles(UserRole.RECRUITER)
@Controller({ path: 'applications', version: '1' })
export class ApplicationsController {
  constructor(
    private readonly applications: ApplicationsService,
    private readonly pipeline: PipelineService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listQuerySchema)) query: z.infer<typeof listQuerySchema>,
  ) {
    return this.applications.list(user, query);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.detail(user, id);
  }

  @Get(':id/events')
  events(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.events(user, id);
  }

  @Post(':id/transitions')
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(transitionSchema)) body: z.infer<typeof transitionSchema>,
  ) {
    return this.pipeline.transition(id, body, user);
  }
}
