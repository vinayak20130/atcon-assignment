import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import {
  type AuthenticatedUser,
  cancelInterviewSchema,
  concludeInterviewSchema,
  listInterviewsQuerySchema,
  type ListInterviewsQuery,
  saveScorecardSchema,
  type SaveScorecardInput,
  scheduleInterviewSchema,
  type ScheduleInterviewInput,
  UserRole,
} from '@atcon/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { InterviewsService } from '../services/interviews.service';
import { ScorecardsService } from '../services/scorecards.service';

/**
 * Both roles reach this controller, which is unusual here and deliberate.
 *
 * Interviews are the one place the two roles meet: recruiters schedule them,
 * interviewers score them. The per-route @Roles below is what keeps that from
 * blurring — scheduling stays with recruiters, and an interviewer's access is
 * limited to panels they actually sit on.
 */
@Roles(UserRole.RECRUITER, UserRole.INTERVIEWER)
@Controller({ path: 'interviews', version: '1' })
export class InterviewsController {
  constructor(
    private readonly interviews: InterviewsService,
    private readonly scorecards: ScorecardsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listInterviewsQuerySchema)) query: ListInterviewsQuery,
  ) {
    return this.interviews.list(user, query);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.interviews.loadViewable(user, id);
  }

  @Roles(UserRole.RECRUITER)
  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelInterviewSchema)) body: { reason: string },
  ) {
    return this.interviews.cancel(user, id, body);
  }

  @Roles(UserRole.RECRUITER)
  @Post(':id/conclude')
  conclude(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(concludeInterviewSchema)) body: { outcome: 'COMPLETED' | 'NO_SHOW' },
  ) {
    return this.interviews.conclude(user, id, body);
  }

  /** The form to fill in, plus whatever this interviewer has already saved. */
  @Get(':id/scorecard')
  myScorecard(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.scorecards.mine(user, id);
  }

  /** Save a draft, or submit. `submit: true` is the irreversible one. */
  @Put(':id/scorecard')
  saveScorecard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(saveScorecardSchema)) body: SaveScorecardInput,
  ) {
    return this.scorecards.save(user, id, body);
  }

  /** The panel's scorecards, minus any this caller has not earned the right to read. */
  @Get(':id/scorecards')
  panel(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.scorecards.panel(user, id);
  }
}

/**
 * Scheduling hangs off the application, not off /interviews.
 *
 * An interview only means something in the context of one candidate at one
 * stage, and the URL says so. It also keeps the recruiter-only write path
 * separate from the routes interviewers use.
 */
@Roles(UserRole.RECRUITER)
@Controller({ path: 'applications', version: '1' })
export class ApplicationInterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

  @Post(':id/interviews')
  schedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(scheduleInterviewSchema)) body: ScheduleInterviewInput,
  ) {
    return this.interviews.schedule(user, id, body);
  }

  @Get(':id/interviews')
  list(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.interviews.list(user, { applicationId: id, limit: 50 });
  }
}
