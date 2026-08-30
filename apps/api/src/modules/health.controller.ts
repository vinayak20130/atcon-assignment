import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  live() {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', checks: { database: { status: 'up' } } };
    } catch (error) {
      return {
        status: 'degraded',
        checks: {
          database: {
            status: 'down',
            error: error instanceof Error ? error.message : 'unknown',
          },
        },
      };
    }
  }
}
