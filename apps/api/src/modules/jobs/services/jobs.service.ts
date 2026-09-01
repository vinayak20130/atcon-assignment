import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  type AuthenticatedUser,
  type JobCreateInput,
  type JobStatusChangeInput,
  type StageDefinitionInput,
  JobStatus,
} from '@atcon/shared';
import { PrismaService } from '../../prisma/services/prisma.service';

/**
 * Requisitions and their pipelines.
 *
 * The decision worth pointing at is the stage COPY. A PipelineTemplate is a
 * reusable blueprint; creating a requisition copies its stages into JobStage
 * rows owned by that requisition, and applications point at those. Editing the
 * template afterwards therefore cannot reshape a pipeline that candidates are
 * already sitting in, or retroactively change what past conversion rates meant.
 *
 * The alternative — pointing applications at template stages — is one table
 * fewer, and corrupts every historical metric the first time someone reorders a
 * template.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(input: JobCreateInput, actor: AuthenticatedUser) {
    const stages = await this.resolveStages(actor.orgId, input);
    const slug = await this.uniqueSlug(actor.orgId, input.slug ?? slugify(input.title));

    const job = await this.prisma.jobRequisition.create({
      data: {
        orgId: actor.orgId,
        title: input.title,
        slug,
        description: input.description,
        department: input.department,
        location: input.location,
        employmentType: input.employmentType,
        isRemote: input.isRemote,
        openings: input.openings,
        pipelineTemplateId: input.pipelineTemplateId,
        createdById: actor.id,
        status: JobStatus.DRAFT,

        // Copied at creation, not at publish, so a draft behaves exactly as it
        // will once live and a recruiter reviews the real thing.
        stages: {
          create: stages.map((stage, index) => ({
            name: stage.name,
            position: index,
            type: stage.type,
            requiresScorecard: stage.requiresScorecard,
            slaDays: stage.slaDays ?? null,
          })),
        },

        // The creator is always assigned, or they would immediately lose sight
        // of the requisition they just made.
        assignments: {
          create: [
            { userId: actor.id, isOwner: true },
            ...input.assigneeIds
              .filter((id) => id !== actor.id)
              .map((userId) => ({ userId, isOwner: false })),
          ],
        },
      },
      include: { stages: { orderBy: { position: 'asc' } } },
    });

    this.logger.log(`Requisition created: ${job.title} (${job.slug})`);
    return job;
  }

  /**
   * Publish, pause, close or fill.
   *
   * `openedAt` is set exactly once. Reopening a paused requisition must not
   * restart the time-to-fill clock — from the business's point of view the role
   * has been open the whole time.
   */
  async changeStatus(jobId: string, input: JobStatusChangeInput, actor: AuthenticatedUser) {
    const job = await this.prisma.jobRequisition.findFirst({
      where: { id: jobId, orgId: actor.orgId },
      select: {
        id: true,
        title: true,
        status: true,
        openedAt: true,
        _count: { select: { stages: true } },
      },
    });
    if (!job) throw new NotFoundException('That requisition could not be found.');

    this.assertStatusChangeIsLegal(job.status as JobStatus, input.status);

    if (input.status === JobStatus.OPEN && job._count.stages === 0) {
      throw new UnprocessableEntityException(
        'A requisition needs a pipeline before it can accept applications.',
      );
    }

    const now = new Date();
    const updated = await this.prisma.jobRequisition.update({
      where: { id: jobId },
      data: {
        status: input.status,
        openedAt: input.status === JobStatus.OPEN && !job.openedAt ? now : job.openedAt,
        closedAt:
          input.status === JobStatus.CLOSED || input.status === JobStatus.FILLED ? now : null,
      },
    });

    this.logger.log(`Requisition ${job.title}: ${job.status} -> ${input.status}`);
    return updated;
  }

  /**
   * Append a stage to a requisition.
   *
   * Appending only. Reordering or deleting a stage is not offered at all,
   * because either would move candidates without a decision and change what
   * past conversion rates meant.
   */
  async appendStage(jobId: string, stage: StageDefinitionInput, actor: AuthenticatedUser) {
    const job = await this.prisma.jobRequisition.findFirst({
      where: { id: jobId, orgId: actor.orgId },
      select: {
        id: true,
        stages: { orderBy: { position: 'desc' }, take: 1, select: { position: true } },
      },
    });
    if (!job) throw new NotFoundException('That requisition could not be found.');

    return this.prisma.jobStage.create({
      data: {
        jobId,
        name: stage.name,
        position: (job.stages[0]?.position ?? -1) + 1,
        type: stage.type,
        requiresScorecard: stage.requiresScorecard,
        slaDays: stage.slaDays ?? null,
      },
    });
  }

  /**
   * Which stage list a new requisition should copy.
   *
   * Either an explicit list or a template — the contract already guarantees one
   * of them is present, and that both contain a HIRED and a REJECTED stage.
   */
  private async resolveStages(
    orgId: string,
    input: JobCreateInput,
  ): Promise<StageDefinitionInput[]> {
    if (input.stages) return input.stages;

    const template = await this.prisma.pipelineTemplate.findFirst({
      where: { id: input.pipelineTemplateId, orgId },
      select: {
        stages: {
          orderBy: { position: 'asc' },
          select: { name: true, type: true, requiresScorecard: true, slaDays: true },
        },
      },
    });

    if (!template) throw new NotFoundException('That pipeline template could not be found.');
    if (template.stages.length === 0) {
      throw new UnprocessableEntityException('That pipeline template has no stages.');
    }

    return template.stages as StageDefinitionInput[];
  }

  /**
   * Legal status transitions.
   *
   * A closed requisition can be reopened; a filled one cannot, because the
   * openings are gone and reopening would let the hire count exceed them.
   */
  private assertStatusChangeIsLegal(from: JobStatus, to: JobStatus): void {
    const allowed: Record<JobStatus, JobStatus[]> = {
      [JobStatus.DRAFT]: [JobStatus.OPEN, JobStatus.CLOSED],
      [JobStatus.OPEN]: [JobStatus.PAUSED, JobStatus.CLOSED, JobStatus.FILLED],
      [JobStatus.PAUSED]: [JobStatus.OPEN, JobStatus.CLOSED],
      [JobStatus.CLOSED]: [JobStatus.OPEN],
      [JobStatus.FILLED]: [],
    };

    if (from === to) {
      throw new UnprocessableEntityException(`This requisition is already ${to.toLowerCase()}.`);
    }
    if (!allowed[from].includes(to)) {
      throw new UnprocessableEntityException(
        `A ${from.toLowerCase()} requisition cannot become ${to.toLowerCase()}.`,
      );
    }
  }

  private async uniqueSlug(orgId: string, base: string): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const taken = await this.prisma.jobRequisition.count({ where: { orgId, slug: candidate } });
      if (taken === 0) return candidate;
    }
    // Twenty collisions on one title is implausible; fall back rather than loop.
    return `${base}-${Date.now()}`;
  }
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
