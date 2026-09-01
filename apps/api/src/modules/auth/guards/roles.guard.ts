import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser, UserRole } from '@atcon/shared';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';

// Answers "can a recruiter do this kind of thing", never "can this recruiter
// touch THIS requisition" — that's JobScopeService. Keeping them apart is what
// stops the role list growing an entry per requisition.
//
// A route with no @Roles() passes; auth is already enforced globally.
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
