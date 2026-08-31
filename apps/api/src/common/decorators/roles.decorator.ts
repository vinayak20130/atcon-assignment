import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@atcon/shared';

export const ROLES_KEY = 'atcon:roles';

/** Coarse role check. Per-requisition scoping is enforced separately. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
