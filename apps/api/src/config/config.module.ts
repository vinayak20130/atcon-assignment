import path from 'node:path';
import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { type Env, validateEnv } from './env';


export const APP_CONFIG = Symbol('APP_CONFIG');

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [path.resolve(__dirname, '../../../../.env')],
      validate: validateEnv,
    }),
  ],
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): Env => Object.freeze(validateEnv(process.env as Record<string, unknown>)),
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
