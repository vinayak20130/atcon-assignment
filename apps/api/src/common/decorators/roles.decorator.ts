import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@atcon/shared';

export const ROLES_KEY = 'atcon:roles';

// Coarse check only — per-requisition scoping lives in JobScopeService.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
