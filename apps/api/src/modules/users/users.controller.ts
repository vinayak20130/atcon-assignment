import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  type AuthenticatedUser,
  type UserCreateInput,
  UserRole,
  userCreateSchema,
} from '@atcon/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';

// No admin role, so any recruiter can add colleagues including other
// recruiters. The boundary that matters here is the organization, not seniority.
@Roles(UserRole.RECRUITER)
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.users.list(user);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(userCreateSchema)) body: UserCreateInput,
  ) {
    return this.users.create(body, user);
  }

  @Post(':id/deactivate')
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.users.deactivate(id, user);
  }
}
