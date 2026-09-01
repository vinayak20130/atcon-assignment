import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { type AuthenticatedUser, UserRole } from '@atcon/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { JobScopeService } from '../../auth/services/job-scope.service';
import { PrismaService } from '../../prisma/services/prisma.service';
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
    private readonly prisma: PrismaService,
    private readonly pipeline: PipelineService,
    private readonly scope: JobScopeService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listQuerySchema)) query: z.infer<typeof listQuerySchema>,
  ) {
    // Scoped through the job filter rather than filtered afterwards, so a page
    // of results is entirely readable by this recruiter.
    const data = await this.prisma.application.findMany({
      where: {
        orgId: user.orgId,
        job: this.scope.visibleJobsFilter(user),
        ...(query.jobId ? { jobId: query.jobId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { lastActivityAt: 'desc' },
      take: query.limit,
      select: {
        id: true,
        status: true,
        appliedAt: true,
        lastActivityAt: true,
        candidate: { select: { id: true, fullName: true, primaryEmail: true } },
        job: { select: { id: true, title: true } },
        currentStage: { select: { id: true, name: true, position: true } },
      },
    });

    return { data };
  }

  @Get(':id')
  async detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const application = await this.loadVisible(user, id);

    return this.prisma.application.findUnique({
      where: { id: application.id },
      select: {
        id: true,
        status: true,
        source: true,
        appliedAt: true,
        decidedAt: true,
        lastActivityAt: true,
        coverLetter: true,
        candidate: {
          select: {
            id: true,
            fullName: true,
            primaryEmail: true,
            primaryPhone: true,
            location: true,
            linkedinUrl: true,
            skills: true,
          },
        },
        job: {
          select: {
            id: true,
            title: true,
            status: true,
            stages: {
              orderBy: { position: 'asc' },
              select: { id: true, name: true, position: true, type: true, requiresScorecard: true },
            },
          },
        },
        currentStage: { select: { id: true, name: true, position: true, type: true } },
        documents: { select: { id: true, filename: true, parseStatus: true, createdAt: true } },
      },
    });
  }

  @Get(':id/events')
  async events(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const application = await this.loadVisible(user, id);

    const data = await this.prisma.applicationEvent.findMany({
      where: { applicationId: application.id },
      orderBy: { seq: 'asc' },
      select: {
        id: true,
        seq: true,
        type: true,
        occurredAt: true,
        reason: true,
        metadata: true,
        actorType: true,
        actor: { select: { id: true, fullName: true } },
        fromStage: { select: { id: true, name: true } },
        toStage: { select: { id: true, name: true } },
      },
    });

    return { data, count: data.length };
  }

  @Post(':id/transitions')
  async transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(transitionSchema)) body: z.infer<typeof transitionSchema>,
  ) {
    return this.pipeline.transition(id, body, user);
  }

  // An application is reachable only through a requisition this recruiter is
  // assigned to. Not-found rather than forbidden: they should not learn that an
  // application exists on a team they are not part of.
  private async loadVisible(user: AuthenticatedUser, id: string) {
    const application = await this.prisma.application.findFirst({
      where: { id, orgId: user.orgId },
      select: { id: true, jobId: true },
    });
    if (!application) throw new NotFoundException('That application could not be found.');

    const scope = await this.scope.forJob(user, application.jobId);
    if (!scope.canView) throw new NotFoundException('That application could not be found.');

    return application;
  }
}
