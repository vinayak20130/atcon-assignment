import 'reflect-metadata';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnv } from 'dotenv';
import { AppModule } from './app.module';
import { OutboxRelayService } from './modules/outbox/services/outbox-relay.service';

loadEnv({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

// Worker entry point.
//
// Boots the same modules as main.http.ts — same DI container, same domain
// services, same Prisma client — but as an application context with no HTTP
// listener, and it starts the outbox relay.
//
// That is the whole reason the API and the worker are one codebase with two
// entry points rather than two apps sharing a package: the rules a recruiter
// triggers over HTTP and the ones a background job triggers are literally the
// same code, with no risk of drift. They still deploy as separate containers
// from one image with different commands, so they scale independently.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });
  app.enableShutdownHooks();

  const logger = new Logger('Worker');

  // Only the worker drains the outbox. The HTTP process writes rows and never
  // relays them, so running three API replicas does not run three relays.
  app.get(OutboxRelayService).start();
  logger.log('Worker started: outbox relay running, processors listening');

  // Nest's shutdown hooks handle SIGTERM/SIGINT, closing queue connections and
  // letting in-flight jobs finish rather than dropping them mid-handler.
  await new Promise<void>((resolve) => {
    const stop = (signal: string) => {
      logger.log(`Received ${signal}, shutting down`);
      void app.close().then(resolve);
    };
    process.once('SIGTERM', () => stop('SIGTERM'));
    process.once('SIGINT', () => stop('SIGINT'));
  });
}

void bootstrap();
