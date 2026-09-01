import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@atcon/db';

/**
 * The Prisma client, with its lifecycle tied to Nest's.
 *
 * Extends the generated client rather than wrapping it: the domain rules that
 * matter live in @atcon/shared as pure functions, and a repository layer here
 * would add indirection without a boundary worth defending.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
