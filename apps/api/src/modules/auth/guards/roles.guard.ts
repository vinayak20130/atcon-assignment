import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser, UserRole } from '@atcon/shared';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';

/**
 * Coarse role check.
 *
 * Answers "may a recruiter do this kind of thing at all?" — never "may this
 * recruiter touch THIS requisition?", which is per-resource scoping and belongs
 * in the services. Keeping the two apart is what stops the role list growing
 * one entry per requisition.
 *
 * A route with no @Roles() passes: authentication is already enforced globally,
 * and most endpoints are open to any authenticated user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!user) throw new UnauthorizedException();

    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        `This action requires one of: ${required.join(', ')}. Your role is ${user.role}.`,
      );
    }
    return true;
  }
}
