import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@atcon/db';
import {
  acceptsScorecards,
  type AuthenticatedUser,
  type CriterionRef,
  panelLean,
  type SaveScorecardInput,
  summarizeScorecard,
  UserRole,
  validateRatings,
  visibleScorecards,
} from '@atcon/shared';
import { appendApplicationEvent } from '../../common/application-events';
import { PrismaService } from '../prisma/prisma.service';
import { InterviewsService } from './interviews.service';

/**
 * Recording structured interview feedback.
 *
 * The rules about who may read what live in @atcon/shared as pure functions;
 * this service loads the rows, asks them, and writes. The split is the same one
 * the pipeline uses, and for the same reason: the anchoring-bias rule is a
 * claim about fairness that should be provable in a unit test rather than
 * inferred from a query.
 */
@Injectable()
export class ScorecardsService {
  private readonly logger = new Logger(ScorecardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly interviews: InterviewsService,
  ) {}

  /** The form an interviewer fills in: the criteria, plus their own answers. */
  async mine(actor: AuthenticatedUser, interviewId: string) {
    const interview = await this.interviews.loadViewable(actor, interviewId);
    const template = await this.resolveTemplate(actor.orgId);

    const existing = await this.prisma.scorecard.findUnique({
      where: { interviewId_interviewerId: { interviewId, interviewerId: actor.id } },
      select: {
        id: true,
        recommendation: true,
        summary: true,
        score: true,
        submittedAt: true,
        ratings: { select: { criterionId: true, rating: true, notes: true } },
      },
    });

    return {
      interview: { id: interview.id, title: interview.title, status: interview.status },
      template: {
        id: template.id,
        name: template.name,
        criteria: template.criteria,
      },
      scorecard: existing,
    };
  }

  async save(actor: AuthenticatedUser, interviewId: string, input: SaveScorecardInput) {
    const interview = await this.interviews.loadViewable(actor, interviewId);

    // Only the panel scores. A recruiter reading the interview is not part of
    // it, and letting them write one would quietly turn the coordinator into an
    // extra vote.
    const onPanel = interview.panelists.some((panelist) => panelist.userId === actor.id);
    if (!onPanel) {
      throw new ForbiddenException('Only the interview panel can submit a scorecard.');
    }

    if (!acceptsScorecards(interview.status)) {
      throw new ConflictException(
        `This interview is ${interview.status.toLowerCase().replace('_', ' ')} and no longer accepts scorecards.`,
      );
    }

    const template = await this.resolveTemplate(actor.orgId);

    const existing = await this.prisma.scorecard.findUnique({
      where: { interviewId_interviewerId: { interviewId, interviewerId: actor.id } },
      select: { id: true, submittedAt: true },
    });

    // A submitted scorecard is a record, not a draft. Reopening it after the
    // panel has read it would let someone quietly revise their verdict to match
    // the room — the exact effect the read restriction exists to prevent.
    if (existing?.submittedAt) {
      throw new ConflictException('Your scorecard has already been submitted.');
    }

    if (input.submit) {
      const check = validateRatings(template.criteria, input.ratings);
      if (!check.valid) throw new UnprocessableEntityException(check.message);
      if (!input.recommendation) {
        throw new UnprocessableEntityException('A recommendation is required to submit.');
      }
    }

    const score = summarizeScorecard(template.criteria, input.ratings);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const scorecard = await tx.scorecard.upsert({
        where: { interviewId_interviewerId: { interviewId, interviewerId: actor.id } },
        create: {
          orgId: interview.orgId,
          interviewId,
          applicationId: interview.applicationId,
          interviewerId: actor.id,
          templateId: template.id,
          recommendation: input.recommendation ?? null,
          summary: input.summary ?? null,
          score,
          submittedAt: input.submit ? now : null,
        },
        update: {
          recommendation: input.recommendation ?? null,
          summary: input.summary ?? null,
          score,
          submittedAt: input.submit ? now : null,
        },
        select: { id: true, submittedAt: true },
      });

      // Ratings are replaced wholesale rather than diffed. A scorecard is small
      // and always saved in full, so a diff would be machinery earning nothing.
      await tx.scorecardRating.deleteMany({ where: { scorecardId: scorecard.id } });
      if (input.ratings.length > 0) {
        await tx.scorecardRating.createMany({
          data: input.ratings.map((rating) => ({
            scorecardId: scorecard.id,
            criterionId: rating.criterionId,
            rating: rating.rating,
            notes: rating.notes ?? null,
          })),
        });
      }

      // Drafts leave no trace in the audit trail. Only the commitment is a
      // fact about the hiring process; a saved draft is a thought in progress.
      if (input.submit) {
        await appendApplicationEvent(tx, {
          orgId: interview.orgId,
          applicationId: interview.applicationId,
          type: 'SCORECARD_SUBMITTED',
          actorType: 'USER',
          actorId: actor.id,
          metadata: {
            interviewId,
            scorecardId: scorecard.id,
            recommendation: input.recommendation,
            score,
          },
        });

        await tx.application.update({
          where: { id: interview.applicationId },
          data: { lastActivityAt: now },
        });

        this.logger.log(`Scorecard ${scorecard.id} submitted for interview ${interviewId}`);
      }

      return { id: scorecard.id, submitted: scorecard.submittedAt !== null, score };
    });
  }

  /**
   * The panel's scorecards, filtered by the anchoring rule.
   *
   * What is withheld is not marked as withheld: the response reports how many
   * scorecards exist and how many are readable, so an interviewer knows a
   * colleague has finished without learning what they said.
   */
  async panel(actor: AuthenticatedUser, interviewId: string) {
    const interview = await this.interviews.loadViewable(actor, interviewId);

    const all = await this.prisma.scorecard.findMany({
      where: { interviewId },
      select: {
        id: true,
        interviewerId: true,
        submittedAt: true,
        recommendation: true,
        summary: true,
        score: true,
        interviewer: { select: { fullName: true } },
        ratings: {
          select: {
            rating: true,
            notes: true,
            criterion: { select: { id: true, label: true, maxRating: true, position: true } },
          },
        },
      },
    });

    const readable = visibleScorecards(
      { id: actor.id, isRecruiter: actor.role === UserRole.RECRUITER },
      all.map((card) => ({
        id: card.id,
        interviewerId: card.interviewerId,
        submittedAt: card.submittedAt,
      })),
    );
    const readableIds = new Set(readable.map((card) => card.id));

    const data = all
      .filter((card) => readableIds.has(card.id))
      .map((card) => ({
        id: card.id,
        interviewerId: card.interviewerId,
        interviewerName: card.interviewer.fullName,
        isMine: card.interviewerId === actor.id,
        submittedAt: card.submittedAt,
        recommendation: card.recommendation,
        summary: card.summary,
        score: card.score,
        ratings: card.ratings
          .slice()
          .sort((a, b) => a.criterion.position - b.criterion.position)
          .map((rating) => ({
            criterionId: rating.criterion.id,
            label: rating.criterion.label,
            rating: rating.rating,
            maxRating: rating.criterion.maxRating,
            notes: rating.notes,
          })),
      }));

    const submittedCount = all.filter((card) => card.submittedAt !== null).length;

    return {
      interviewId,
      data,
      // Counts, not contents. Knowing two of three are in is scheduling
      // information; knowing what they said is the thing being protected.
      submittedCount,
      withheldCount: submittedCount - data.filter((card) => card.submittedAt !== null).length,
      lean: panelLean(
        data
          .filter((card) => card.recommendation !== null)
          .map((card) => card.recommendation as never),
      ),
    };
  }

  /**
   * The org's scorecard template.
   *
   * One per organization, seeded rather than managed through the API. Editable
   * templates are a real product need and a large surface — versioning, and
   * what happens to scorecards already answered against an older set of
   * questions — that this assignment does not ask for.
   */
  private async resolveTemplate(orgId: string): Promise<{
    id: string;
    name: string;
    criteria: CriterionRef[];
  }> {
    const template = await this.prisma.scorecardTemplate.findFirst({
      where: { orgId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        criteria: {
          orderBy: { position: 'asc' },
          select: { id: true, label: true, description: true, weight: true, maxRating: true, position: true },
        },
      },
    });

    if (!template) {
      throw new NotFoundException('No scorecard template is configured for this organization.');
    }
    return template as never;
  }
}
