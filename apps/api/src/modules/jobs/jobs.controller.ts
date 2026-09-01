import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import {
  type AuthenticatedUser,
  type JobCreateInput,
  type JobStatusChangeInput,
  type StageDefinitionInput,
  UserRole,
  jobCreateSchema,
  jobStatusChangeSchema,
  stageDefinitionSchema,
} from '@atcon/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JobScopeService } from '../auth/job-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from './jobs.service';

@Roles(UserRole.RECRUITER)
@Controller({ path: 'jobs', version: '1' })
export class JobsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly scope: JobScopeService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    // Scoped inside the query rather than filtered afterwards, so a recruiter
    // never sees a requisition they are not assigned to — not even a count.
    const data = await this.prisma.jobRequisition.findMany({
      where: this.scope.visibleJobsFilter(user),
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        department: true,
        location: true,
        openings: true,
        openedAt: true,
      },
    });
    return { data };
  }

  @Get(':id')
  async detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const scope = await this.scope.forJob(user, id);
    // Not-found rather than forbidden: a recruiter should not be able to learn
    // that a requisition exists on a team they are not part of.
    if (!scope.canView) throw new NotFoundException('That requisition could not be found.');

    return this.prisma.jobRequisition.findFirst({
      where: { id, orgId: user.orgId },
      include: {
        // These stages belong to the requisition, not to the template it came
        // from. That is the copy.
        stages: { orderBy: { position: 'asc' } },
        assignments: {
          select: { isOwner: true, user: { select: { id: true, fullName: true } } },
        },
        pipelineTemplate: { select: { id: true, name: true } },
      },
    });
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(jobCreateSchema)) body: JobCreateInput,
  ) {
    return this.jobs.create(body, user);
  }

  @Post(':id/status')
  async changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(jobStatusChangeSchema)) body: JobStatusChangeInput,
  ) {
    const scope = await this.scope.forJob(user, id);
    if (!scope.canManage) throw new NotFoundException('That requisition could not be found.');
    return this.jobs.changeStatus(id, body, user);
  }

  @Post(':id/stages')
  async appendStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(stageDefinitionSchema)) body: StageDefinitionInput,
  ) {
    const scope = await this.scope.forJob(user, id);
    if (!scope.canManage) throw new NotFoundException('That requisition could not be found.');
    return this.jobs.appendStage(id, body, user);
  }
}
