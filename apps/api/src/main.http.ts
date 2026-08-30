import path from 'node:path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
