import 'reflect-metadata';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { APP_CONFIG } from './config/config.module';
import type { Env } from './config/env';

// Loopback and private-network origins. In development the app is reached from
// more than one host — localhost on this machine, and the machine's LAN address
// when the UI is opened on a phone — so matching the shape beats maintaining a
// list that changes with the network.
const PRIVATE_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get<Env>(APP_CONFIG);

  // Production trusts exactly one origin; development trusts the private
  // network it is running on. Requests with no Origin (curl, server-to-server)
  // are not browser requests and are never what CORS is protecting.
  app.enableCors({
    origin:
      config.NODE_ENV === 'production'
        ? [config.WEB_PUBLIC_URL]
        : (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) =>
            callback(
              null,
              !origin || origin === config.WEB_PUBLIC_URL || PRIVATE_ORIGIN.test(origin),
            ),
    credentials: true,
  });

  // Every route is /api/v1/... — the prefix keeps the API distinguishable from
  // static assets behind one host, and URI versioning makes a breaking change
  // additive rather than a coordinated deploy.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // '::' accepts both stacks. Binding '0.0.0.0' listens on IPv4 only, and
  // browsers resolve localhost to ::1 first — the connection is refused before
  // it ever reaches Nest, while curl quietly falls back to IPv4 and looks fine.
  await app.listen(config.API_PORT, '::');
}
bootstrap();
