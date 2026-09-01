import { Injectable } from '@nestjs/common';
import { type AuthenticatedUser, UserRole } from '@atcon/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A filter guaranteed to select zero rows.
 *
 * Used wherever a role's scope resolves to "nothing", so the empty case is a
 * deliberate, readable value rather than an omitted key — Prisma reads a
 * missing key as "no constraint" and would silently widen the query to the
 * entire organization.
 */
const matchesNothing = (orgId: string) => ({ orgId, id: { in: [] as string[] } });

export interface JobScope {
  canView: boolean;
  canManage: boolean;
}

/**
 * The one scoping dimension layered on top of static roles.
 *
 * Pure RBAC would mean every recruiter reads every candidate on every
 * requisition, which is wrong for an ATS. Full ReBAC is more machinery than
 * this system earns. Roles plus per-requisition assignment is the cheap 90%:
 * one join, and the interesting property holds.
 */
@Injectable()
export class JobScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async forJob(user: AuthenticatedUser, jobId: string): Promise<JobScope> {
    if (user.role !== UserRole.RECRUITER) return { canView: false, canManage: false };

    // The org check lives in the join rather than a separate query: a recruiter
    // cannot be assigned to another organization's requisition, so one lookup
    // answers both questions.
    const assigned = await this.prisma.jobAssignment.count({
      where: { jobId, userId: user.id, job: { orgId: user.orgId } },
    });

    const permitted = assigned > 0;
    return { canView: permitted, canManage: permitted };
  }

  /**
   * The `where` fragment restricting a list to what this user may see.
   *
   * Applied inside the query rather than filtering the results, so a page of 25
   * is 25 rows they can actually read — not 25 minus however many were stripped
   * afterwards.
   */
  visibleJobsFilter(user: AuthenticatedUser): Record<string, unknown> {
    switch (user.role) {
      case UserRole.RECRUITER:
        return { orgId: user.orgId, assignments: { some: { userId: user.id } } };
      case UserRole.INTERVIEWER:
        // Interviewers reach work through the interviews they are on, never
        // through a requisition. Until interviews exist, they see nothing.
        return matchesNothing(user.orgId);
    }
  }
}
