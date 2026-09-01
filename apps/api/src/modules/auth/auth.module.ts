import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// JwtModule is registered empty and secrets passed per call: access tokens and
// candidate magic links will use different keys, and one global secret makes it
// easy to sign the wrong thing with the wrong one.
@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
