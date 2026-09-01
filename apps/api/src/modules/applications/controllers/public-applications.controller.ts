import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UnprocessableEntityException,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  type ApplicationSubmitInput,
  type ApplicationSubmitResponse,
  applicationSubmitSchema,
} from '@atcon/shared';
import { Public } from '../../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ApplicationIntakeService } from '../services/application-intake.service';
import { validateResumeUpload } from '../../storage/file-validation';

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

// The candidate-facing surface. Unauthenticated by design: candidates have no
// accounts, because a signup wall in front of a job application costs real
// applicants and buys nothing.
@Public()
@Controller({ path: 'public', version: '1' })
export class PublicApplicationsController {
  constructor(private readonly intake: ApplicationIntakeService) {}

  @Post('jobs/:jobId/applications')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('resume'))
  async apply(
    @Param('jobId') jobId: string,
    @Body(new ZodValidationPipe(applicationSubmitSchema)) body: ApplicationSubmitInput,
    @UploadedFile() resume: Express.Multer.File | undefined,
  ): Promise<ApplicationSubmitResponse> {
    // Checked before anything expensive. A filled honeypot gets the same 201 a
    // real submission does — telling a bot it was detected just teaches whoever
    // wrote it to stop filling the field.
    if (body.website && body.website.length > 0) {
      return {
        applicationId: 'not-recorded',
        status: 'RECEIVED',
        message: 'Your application has been received.',
      };
    }

    const validated = validateResumeUpload(resume, { maxBytes: MAX_RESUME_BYTES });

    return this.intake.submit({ jobId, body, resume: validated });
  }
}
