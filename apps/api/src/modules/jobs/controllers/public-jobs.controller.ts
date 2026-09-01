import { Controller, Get, Param, Query } from '@nestjs/common';
import { type PublicJobQuery, publicJobQuerySchema } from '@atcon/shared';
import { Public } from '../../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PublicJobsService } from '../services/public-jobs.service';

@Public()
@Controller({ path: 'public/jobs', version: '1' })
export class PublicJobsController {
  constructor(private readonly jobs: PublicJobsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(publicJobQuerySchema)) query: PublicJobQuery) {
    return this.jobs.list(query);
  }

  @Get(':idOrSlug')
  detail(@Param('idOrSlug') idOrSlug: string) {
    return this.jobs.detail(idOrSlug);
  }
}
