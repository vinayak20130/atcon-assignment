import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { type PublicJobQuery, publicJobQuerySchema } from '@atcon/shared';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';

// The public careers page.
//
// Everything here is world-readable, so every select is an explicit allow-list
// rather than a whole row. `select: *` on a requisition would publish the
// assigned recruiters and internal notes alongside the job description — the
// kind of leak that happens by omission rather than by decision.
@Public()
@Controller({ path: 'public/jobs', version: '1' })
export class PublicJobsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query(new ZodValidationPipe(publicJobQuerySchema)) query: PublicJobQuery) {
    const data = await this.prisma.jobRequisition.findMany({
      where: {
        status: 'OPEN',
        ...(query.department ? { department: query.department } : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' as const } },
                { description: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
      select: {
        id: true,
        slug: true,
        title: true,
        department: true,
        location: true,
        employmentType: true,
        isRemote: true,
        openedAt: true,
      },
    });

    return { data };
  }

  @Get(':idOrSlug')
  async detail(@Param('idOrSlug') idOrSlug: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

    const job = await this.prisma.jobRequisition.findFirst({
      where: { status: 'OPEN', ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }) },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        department: true,
        location: true,
        employmentType: true,
        isRemote: true,
        openings: true,
        openedAt: true,
        // Stage NAMES only, so applicants know what the process looks like.
        // SLAs and scorecard requirements are not selected: how we evaluate
        // people is not public.
        stages: {
          orderBy: { position: 'asc' },
          where: { type: { notIn: ['HIRED', 'REJECTED'] } },
          select: { name: true, position: true },
        },
      },
    });

    if (!job) throw new NotFoundException('This job posting could not be found.');
    return job;
  }
}
