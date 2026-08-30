import path from 'node:path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { APP_CONFIG } from './config/config.module';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Every route is /api/v1/... — the prefix keeps the API distinguishable from
  // static assets behind one host, and URI versioning makes a breaking change
  // additive rather than a coordinated deploy.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const config = app.get<Env>(APP_CONFIG);
  await app.listen(config.API_PORT, '0.0.0.0');
}
bootstrap();
