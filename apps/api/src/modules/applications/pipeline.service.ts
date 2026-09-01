import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  type AuthenticatedUser,
  type StageRef,
  type TransitionKind,
  TransitionDenialCode,
  evaluateTransition,
} from '@atcon/shared';
import { Prisma } from '@atcon/db';
import { PrismaService } from '../prisma/prisma.service';

export interface TransitionResult {
  applicationId: string;
  kind: TransitionKind;
  fromStage: { id: string; name: string };
  toStage: { id: string; name: string };
  status: string;
  seq: number;
}

// Moving a candidate through the pipeline.
//
// This service does IO — lock the row, gather the facts, write the result —
// while every RULE about whether a move is allowed lives in evaluateTransition
// as a pure function. That is what lets the guard matrix be covered without a
// database, and stops the rules quietly depending on request context they were
// never handed.
//
// Each transition is one transaction containing two writes that must agree: the
// read model (application.currentStageId) and the append-only event.
@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(private readonly prisma: PrismaService) {}

  async transition(
    applicationId: string,
    request: { fromStageId: string; toStageId: string; reason?: string },
    actor: AuthenticatedUser,
  ): Promise<TransitionResult> {
    return this.prisma.$transaction(async (tx) => {
      // Lock first. Everything read after this is consistent for the duration,
      // so two recruiters cannot both pass the guards on the same stale state.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM applications WHERE id = ${applicationId}::uuid FOR UPDATE
      `;
      if (locked.length === 0) throw new NotFoundException('That application could not be found.');

      const application = await tx.application.findUniqueOrThrow({
        where: { id: applicationId },
        select: {
          id: true,
          orgId: true,
          status: true,
          currentStageId: true,
          job: {
            select: {
              id: true,
              status: true,
              openings: true,
              assignments: { where: { userId: actor.id }, select: { id: true } },
              stages: {
                orderBy: { position: 'asc' },
                select: {
                  id: true,
                  name: true,
                  position: true,
                  type: true,
                  requiresScorecard: true,
                },
              },
            },
          },
        },
      });

      if (application.orgId !== actor.orgId) {
        throw new NotFoundException('That application could not be found.');
      }

      const hiredCount = await tx.application.count({
        where: { jobId: application.job.id, status: 'HIRED' },
      });

      const decision = evaluateTransition(
        {
          applicationStatus: application.status,
          currentStageId: application.currentStageId,
          jobStatus: application.job.status,
          openingsRemaining: application.job.openings - hiredCount,
          // Scorecards do not exist yet, so nothing is outstanding. When
          // interviews land this becomes a real count and the guard starts
          // biting without the state machine changing at all.
          pendingScorecardCount: 0,
          stages: application.job.stages as StageRef[],
          actor: {
            id: actor.id,
            role: actor.role,
            isAssignedToJob: application.job.assignments.length > 0,
          },
        },
        request,
      );

      if (!decision.allowed) throw this.toHttp(decision.code, decision.message);

      const now = new Date();
      const isTerminal = decision.resultingStatus !== 'ACTIVE';

      await tx.application.update({
        where: { id: applicationId },
        data: {
          currentStageId: decision.toStage.id,
          status: decision.resultingStatus,
          lastActivityAt: now,
          // Reopening clears the decision timestamp; the clock restarts.
          decidedAt: isTerminal ? now : null,
        },
      });

      // Read inside the transaction that writes it. The unique index on
      // (applicationId, seq) is the real guarantee: if two transitions race,
      // one commits and the other fails the constraint and is retried, rather
      // than both claiming the same sequence and one silently overwriting.
      const latest = await tx.applicationEvent.findFirst({
        where: { applicationId },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      });
      const seq = (latest?.seq ?? 0) + 1;

      await tx.applicationEvent.create({
        data: {
          orgId: application.orgId,
          applicationId,
          seq,
          type: eventTypeFor(decision.kind),
          fromStageId: decision.fromStage.id,
          toStageId: decision.toStage.id,
          actorType: 'USER',
          actorId: actor.id,
          reason: request.reason?.trim() || null,
          metadata: {
            kind: decision.kind,
            fromStageName: decision.fromStage.name,
            toStageName: decision.toStage.name,
          } as Prisma.InputJsonValue,
        },
      });

      // Filling the final opening closes the requisition, which is what stops
      // the time-to-fill clock.
      if (decision.kind === 'HIRE' && hiredCount + 1 >= application.job.openings) {
        await tx.jobRequisition.update({
          where: { id: application.job.id },
          data: { status: 'FILLED', closedAt: now },
        });
      }

      this.logger.log(`Application ${applicationId}: ${decision.kind} (seq ${seq})`);

      return {
        applicationId,
        kind: decision.kind,
        fromStage: { id: decision.fromStage.id, name: decision.fromStage.name },
        toStage: { id: decision.toStage.id, name: decision.toStage.name },
        status: decision.resultingStatus,
        seq,
      };
    });
  }

  // The status codes carry meaning a client acts on: 409 means "your view is
  // stale, reload", 403 means "you may not do this, hide the control", 422
  // means "fix something first". Collapsing them into 400 would push that
  // distinction into message-string matching.
  private toHttp(code: TransitionDenialCode, message: string): Error {
    switch (code) {
      case TransitionDenialCode.STALE_STAGE:
        return new ConflictException(message);
      case TransitionDenialCode.NO_SCOPE:
      case TransitionDenialCode.ROLE_NOT_PERMITTED:
        return new ForbiddenException(message);
      case TransitionDenialCode.UNKNOWN_STAGE:
        return new NotFoundException(message);
      default:
        return new UnprocessableEntityException(message);
    }
  }
}

function eventTypeFor(kind: TransitionKind) {
  switch (kind) {
    case 'REJECT':
      return 'REJECTED' as const;
    case 'HIRE':
      return 'HIRED' as const;
    case 'WITHDRAW':
      return 'WITHDRAWN' as const;
    case 'REOPEN':
      return 'REOPENED' as const;
    default:
      return 'STAGE_CHANGED' as const;
  }
}
