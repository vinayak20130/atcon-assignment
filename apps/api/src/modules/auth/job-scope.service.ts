import { Injectable } from '@nestjs/common';
import { type AuthenticatedUser, UserRole } from '@atcon/shared';
import { PrismaService } from '../prisma/prisma.service';

// Prisma treats a missing key as "no constraint", so returning {} for an empty
// scope would widen the query to the whole organization. Be explicit instead.
const matchesNothing = (orgId: string) => ({ orgId, id: { in: [] as string[] } });

export interface JobScope {
  canView: boolean;
  canManage: boolean;
}

// Roles alone would let every recruiter read every candidate on every
// requisition. Full ReBAC is more machinery than this needs. Per-requisition
// assignment sits in between: one join, and a recruiter only sees their own.
@Injectable()
export class JobScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async forJob(user: AuthenticatedUser, jobId: string): Promise<JobScope> {
    if (user.role !== UserRole.RECRUITER) return { canView: false, canManage: false };

    // orgId goes in the join rather than a second query — a recruiter can't be
    // assigned to another org's requisition, so one lookup answers both.
    const assigned = await this.prisma.jobAssignment.count({
      where: { jobId, userId: user.id, job: { orgId: user.orgId } },
    });

    const permitted = assigned > 0;
    return { canView: permitted, canManage: permitted };
  }

  // Filters in the query, not after it, so a page of 25 is 25 readable rows
  // rather than 25 minus whatever got stripped.
  visibleJobsFilter(user: AuthenticatedUser): Record<string, unknown> {
    switch (user.role) {
      case UserRole.RECRUITER:
        return { orgId: user.orgId, assignments: { some: { userId: user.id } } };
      case UserRole.INTERVIEWER:
        // Interviewers reach work through their interviews, not requisitions.
        // Until interviews exist they see nothing.
        return matchesNothing(user.orgId);
    }
  }
}
