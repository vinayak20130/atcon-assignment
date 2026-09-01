import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { type AuthenticatedUser, UserRole } from '@atcon/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JobScopeService } from '../../auth/services/job-scope.service';
import { AnalyticsService } from '../services/analytics.service';

@Roles(UserRole.RECRUITER)
@Controller({ path: 'analytics', version: '1' })
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly scope: JobScopeService,
  ) {}

  @Get('pipeline-health')
  async pipelineHealth(@CurrentUser() user: AuthenticatedUser, @Query('jobId') jobId?: string) {
    if (jobId) {
      const scope = await this.scope.forJob(user, jobId);
      if (!scope.canView) throw new NotFoundException('That requisition could not be found.');
    }
    return this.analytics.pipelineHealth(user.orgId, jobId);
  }

  @Get('sources')
  sources(@CurrentUser() user: AuthenticatedUser) {
    return this.analytics.sourceEffectiveness(user.orgId);
  }
}
