import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '@atcon/shared';
import { JobScopeService } from '../../auth/services/job-scope.service';
import { PrismaService } from '../../prisma/services/prisma.service';

export interface ApplicationListQuery {
  jobId?: string;
  status?: 'ACTIVE' | 'HIRED' | 'REJECTED' | 'WITHDRAWN';
  limit: number;
}

/**
 * Reading applications: lists, detail, and the audit trail.
 *
 * The write side lives in PipelineService, which owns the state machine, and in
 * ApplicationIntakeService, which owns the public form. What is here is
 * everything a recruiter reads — including the visibility rule that decides
 * whether they may read it at all.
 */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: JobScopeService,
  ) {}

  async list(user: AuthenticatedUser, query: ApplicationListQuery) {
    // Scoped inside the query rather than filtered afterwards, so a page of
    // results is entirely readable by this recruiter — 50 rows they can open,
    // not 50 minus however many were stripped on the way out.
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

  async detail(user: AuthenticatedUser, id: string) {
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

  /** The full history, oldest first. Ordered by seq, never by timestamp. */
  async events(user: AuthenticatedUser, id: string) {
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

  /**
   * An application is reachable only through a requisition this recruiter is
   * assigned to.
   *
   * Not-found rather than forbidden: they should not learn that an application
   * exists on a team they are not part of. A 403 here would leak the existence
   * of every candidate in the organization.
   */
  async loadVisible(user: AuthenticatedUser, id: string) {
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
