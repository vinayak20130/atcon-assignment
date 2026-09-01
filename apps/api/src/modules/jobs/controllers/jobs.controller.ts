import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  type AuthenticatedUser,
  type JobCreateInput,
  type JobStatusChangeInput,
  type PipelineTemplateCopyInput,
  type PipelineTemplateCreateInput,
  type StageDefinitionInput,
  UserRole,
  jobCreateSchema,
  jobStatusChangeSchema,
  pipelineTemplateCopySchema,
  pipelineTemplateCreateSchema,
  stageDefinitionSchema,
} from '@atcon/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { JobsService } from '../services/jobs.service';

@Roles(UserRole.RECRUITER)
@Controller({ path: 'jobs', version: '1' })
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.jobs.listVisible(user);
  }

  @Get('templates')
  templates(@CurrentUser() user: AuthenticatedUser) {
    return this.jobs.listTemplates(user);
  }

  @Post('templates')
  createTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(pipelineTemplateCreateSchema)) body: PipelineTemplateCreateInput,
  ) {
    return this.jobs.createTemplate(body, user);
  }

  @Post('templates/:id/copy')
  copyTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(pipelineTemplateCopySchema)) body: PipelineTemplateCopyInput,
  ) {
    return this.jobs.copyTemplate(id, body, user);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.detail(user, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(jobCreateSchema)) body: JobCreateInput,
  ) {
    return this.jobs.create(body, user);
  }

  @Post(':id/status')
  changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(jobStatusChangeSchema)) body: JobStatusChangeInput,
  ) {
    return this.jobs.changeStatus(id, body, user);
  }

  @Post(':id/stages')
  appendStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(stageDefinitionSchema)) body: StageDefinitionInput,
  ) {
    return this.jobs.appendStage(id, body, user);
  }
}
