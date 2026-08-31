import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * Secrets are passed per-call in AuthService rather than registered here,
 * because access tokens and (later) candidate magic links are signed with
 * different keys. One global secret makes it too easy to sign the wrong thing.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
