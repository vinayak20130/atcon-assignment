import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser, UserCreateInput, UserSummary } from '@atcon/shared';
import { Prisma } from '@atcon/db';
import { hashPassword } from '@atcon/shared/server';
import { PrismaService } from '../prisma/prisma.service';

const SUMMARY = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

// Every query is scoped by the caller's orgId, taken from their token. That is
// the whole of tenant isolation, and the one place it would leak if an orgId
// were ever read from a request body.
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser): Promise<UserSummary[]> {
    return this.prisma.user.findMany({
      where: { orgId: actor.orgId },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
      select: { ...SUMMARY },
    }) as Promise<UserSummary[]>;
  }

  async create(input: UserCreateInput, actor: AuthenticatedUser): Promise<UserSummary> {
    try {
      return (await this.prisma.user.create({
        data: {
          // From the token, never the body.
          orgId: actor.orgId,
          email: input.email,
          fullName: input.fullName,
          role: input.role,
          passwordHash: await hashPassword(input.password),
        },
        select: { ...SUMMARY },
      })) as UserSummary;
    } catch (error) {
      // Unique on (orgId, email) — a colleague with this address already exists.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Someone with that email is already in your organization.');
      }
      throw error;
    }
  }

  // Deactivate, never delete. Users are actors in the audit trail, so removing
  // one would orphan the history of every decision they made.
  async deactivate(id: string, actor: AuthenticatedUser): Promise<UserSummary> {
    if (id === actor.id) {
      throw new ConflictException('You cannot deactivate your own account.');
    }

    // updateMany scoped by orgId, so one organization cannot touch another's
    // users even by guessing an id.
    const { count } = await this.prisma.user.updateMany({
      where: { id, orgId: actor.orgId, isActive: true },
      data: { isActive: false },
    });
    if (count === 0) throw new NotFoundException('That user could not be found.');

    return (await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { ...SUMMARY },
    })) as UserSummary;
  }
}
