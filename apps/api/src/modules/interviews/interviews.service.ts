import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@atcon/db';
import {
  type AuthenticatedUser,
  type CancelInterviewInput,
  type ConcludeInterviewInput,
  type ScheduleInterviewInput,
  UserRole,
} from '@atcon/shared';
import { appendApplicationEvent } from '../../common/application-events';
import { JobScopeService } from '../auth/job-scope.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Scheduling and concluding interviews.
 *
 * The calendar itself is Cal.com's job — availability, invites, the video link.
 * What this service owns is everything an ATS cannot hand off: which stage an
 * interview belongs to, who owes a scorecard, and an audit trail that matches
 * the rest of the pipeline.
 */
@Injectable()
export class InterviewsService {
  private readonly logger = new Logger(InterviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: JobScopeService,
  ) {}

  async schedule(actor: AuthenticatedUser, applicationId: string, input: ScheduleInterviewInput) {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, orgId: actor.orgId },
      select: {
        id: true,
        orgId: true,
        jobId: true,
        status: true,
        currentStageId: true,
        currentStage: { select: { id: true, name: true } },
      },
    });
    if (!application) throw new NotFoundException('That application could not be found.');

    const scope = await this.scope.forJob(actor, application.jobId);
    if (!scope.canManage) throw new NotFoundException('That application could not be found.');

    // Interviewing a rejected or withdrawn candidate is always a mistake — an
    // application nobody can advance should not be accruing commitments.
    if (application.status !== 'ACTIVE') {
      throw new ConflictException(
        `This application is ${application.status.toLowerCase()} and cannot be interviewed.`,
      );
    }

    // The panel must be real, in this org, and able to interview. Checked as a
    // set rather than one at a time so a bad request names every problem at
    // once instead of one per round trip.
    const panelistIds = input.panelists.map((panelist) => panelist.userId);
    const known = await this.prisma.user.findMany({
      where: { id: { in: panelistIds }, orgId: actor.orgId, isActive: true },
      select: { id: true },
    });
    if (known.length !== panelistIds.length) {
      const found = new Set(known.map((user) => user.id));
      const missing = panelistIds.filter((id) => !found.has(id));
      throw new BadRequestException(
        `Not an active member of this organization: ${missing.join(', ')}.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const interview = await tx.interview.create({
        data: {
          orgId: application.orgId,
          applicationId: application.id,
          // Pinned to the stage the application is in NOW. An interview
          // scheduled for a screen should not start gating an offer because the
          // candidate moved on in the meantime.
          stageId: application.currentStageId,
          title: input.title,
          scheduledStart: input.scheduledStart,
          scheduledEnd: input.scheduledEnd,
          timezone: input.timezone,
          bookingUrl: input.bookingUrl ?? null,
          meetingUrl: input.meetingUrl ?? null,
          notes: input.notes ?? null,
          createdById: actor.id,
          panelists: {
            create: input.panelists.map((panelist) => ({
              userId: panelist.userId,
              isRequired: panelist.isRequired,
            })),
          },
        },
        select: { id: true, title: true, scheduledStart: true, scheduledEnd: true, status: true },
      });

      await appendApplicationEvent(tx, {
        orgId: application.orgId,
        applicationId: application.id,
        type: 'INTERVIEW_SCHEDULED',
        actorType: 'USER',
        actorId: actor.id,
        metadata: {
          interviewId: interview.id,
          title: interview.title,
          stageName: application.currentStage.name,
          scheduledStart: input.scheduledStart.toISOString(),
          panelSize: input.panelists.length,
          requiredScorecards: input.panelists.filter((panelist) => panelist.isRequired).length,
        },
      });

      await tx.application.update({
        where: { id: application.id },
        data: { lastActivityAt: new Date() },
      });

      this.logger.log(`Interview ${interview.id} scheduled on application ${application.id}`);
      return interview;
    });
  }

  async cancel(actor: AuthenticatedUser, interviewId: string, input: CancelInterviewInput) {
    const interview = await this.loadManageable(actor, interviewId);

    if (interview.status === 'CANCELLED') {
      throw new ConflictException('That interview is already cancelled.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.interview.update({
        where: { id: interview.id },
        data: { status: 'CANCELLED', cancellationNote: input.reason },
        select: { id: true, status: true, cancellationNote: true },
      });

      // Cancelling releases the stage gate: a cancelled interview owes no
      // scorecards, so an application blocked behind one becomes movable again.
      await appendApplicationEvent(tx, {
        orgId: interview.orgId,
        applicationId: interview.applicationId,
        type: 'INTERVIEW_CANCELLED',
        actorType: 'USER',
        actorId: actor.id,
        reason: input.reason,
        metadata: { interviewId: interview.id, title: interview.title },
      });

      return updated;
    });
  }

  async conclude(actor: AuthenticatedUser, interviewId: string, input: ConcludeInterviewInput) {
    const interview = await this.loadManageable(actor, interviewId);

    if (interview.status === 'CANCELLED') {
      throw new ConflictException('That interview was cancelled.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.interview.update({
        where: { id: interview.id },
        data: { status: input.outcome },
        select: { id: true, status: true },
      });

      await appendApplicationEvent(tx, {
        orgId: interview.orgId,
        applicationId: interview.applicationId,
        type: 'INTERVIEW_CONCLUDED',
        actorType: 'USER',
        actorId: actor.id,
        metadata: { interviewId: interview.id, outcome: input.outcome, title: interview.title },
      });

      return updated;
    });
  }

  /**
   * Interviews this user can see.
   *
   * The two roles reach interviews from opposite directions: a recruiter sees
   * everything on the requisitions they own, an interviewer sees only the
   * panels they sit on. Expressed as a where-fragment rather than a
   * post-filter, so a page of results is a page they can all read.
   */
  async list(actor: AuthenticatedUser, query: { applicationId?: string; status?: string; limit: number }) {
    const visibility: Prisma.InterviewWhereInput =
      actor.role === UserRole.RECRUITER
        ? { application: { job: this.scope.visibleJobsFilter(actor) as Prisma.JobRequisitionWhereInput } }
        : { panelists: { some: { userId: actor.id } } };

    const data = await this.prisma.interview.findMany({
      where: {
        orgId: actor.orgId,
        ...visibility,
        ...(query.applicationId ? { applicationId: query.applicationId } : {}),
        ...(query.status ? { status: query.status as never } : {}),
      },
      orderBy: { scheduledStart: 'desc' },
      take: query.limit,
      select: {
        id: true,
        title: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        timezone: true,
        meetingUrl: true,
        stage: { select: { id: true, name: true } },
        application: {
          select: {
            id: true,
            candidate: { select: { id: true, fullName: true } },
            job: { select: { id: true, title: true } },
          },
        },
        panelists: {
          select: {
            userId: true,
            isRequired: true,
            user: { select: { fullName: true } },
          },
        },
        scorecards: { select: { interviewerId: true, submittedAt: true } },
      },
    });

    return {
      data: data.map((interview) => {
        const submitted = new Set(
          interview.scorecards.filter((card) => card.submittedAt).map((card) => card.interviewerId),
        );
        const { scorecards: _scorecards, ...rest } = interview;
        return {
          ...rest,
          panelists: interview.panelists.map((panelist) => ({
            userId: panelist.userId,
            fullName: panelist.user.fullName,
            isRequired: panelist.isRequired,
            hasSubmitted: submitted.has(panelist.userId),
          })),
        };
      }),
    };
  }

  /** An interview the caller may read: on their panel, or on their requisition. */
  async loadViewable(actor: AuthenticatedUser, interviewId: string) {
    const interview = await this.prisma.interview.findFirst({
      where: { id: interviewId, orgId: actor.orgId },
      select: {
        id: true,
        orgId: true,
        applicationId: true,
        stageId: true,
        title: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        timezone: true,
        meetingUrl: true,
        bookingUrl: true,
        notes: true,
        cancellationNote: true,
        application: { select: { jobId: true } },
        panelists: {
          select: { userId: true, isRequired: true, user: { select: { fullName: true } } },
        },
      },
    });
    if (!interview) throw new NotFoundException('That interview could not be found.');

    if (actor.role === UserRole.INTERVIEWER) {
      const onPanel = interview.panelists.some((panelist) => panelist.userId === actor.id);
      if (!onPanel) throw new NotFoundException('That interview could not be found.');
      return interview;
    }

    const scope = await this.scope.forJob(actor, interview.application.jobId);
    if (!scope.canView) throw new NotFoundException('That interview could not be found.');
    return interview;
  }

  private async loadManageable(actor: AuthenticatedUser, interviewId: string) {
    const interview = await this.prisma.interview.findFirst({
      where: { id: interviewId, orgId: actor.orgId },
      select: {
        id: true,
        orgId: true,
        applicationId: true,
        title: true,
        status: true,
        application: { select: { jobId: true } },
      },
    });
    if (!interview) throw new NotFoundException('That interview could not be found.');

    const scope = await this.scope.forJob(actor, interview.application.jobId);
    if (!scope.canManage) {
      throw new ForbiddenException('You are not assigned to that requisition.');
    }
    return interview;
  }
}
