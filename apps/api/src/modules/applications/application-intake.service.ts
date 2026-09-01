import { createHash } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ApplicationSubmitInput, ApplicationSubmitResponse } from '@atcon/shared';
import { Prisma } from '@atcon/db';
import { PrismaService } from '../prisma/prisma.service';
import { CandidateIdentityService } from '../candidates/candidate-identity.service';

export interface ResumeUpload {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

// Public application intake.
//
// Everything that must be consistent happens in ONE transaction: the candidate,
// the application, and the document record. Identity resolution runs inside it
// too, so a candidate applying twice cannot produce two records even briefly.
//
// The resume is NOT parsed here. Parsing a PDF takes seconds and can fail on a
// malformed file — inline, that would return 500 to the candidate and their
// application would be lost entirely. It is queued instead, once the queue
// exists; for now the document is stored with parseStatus PENDING.
@Injectable()
export class ApplicationIntakeService {
  private readonly logger = new Logger(ApplicationIntakeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: CandidateIdentityService,
  ) {}

  async submit(input: {
    jobId: string;
    body: ApplicationSubmitInput;
    resume: ResumeUpload;
  }): Promise<ApplicationSubmitResponse> {
    const job = await this.prisma.jobRequisition.findFirst({
      where: { id: input.jobId, status: 'OPEN' },
      select: {
        id: true,
        orgId: true,
        title: true,
        stages: { orderBy: { position: 'asc' }, take: 1, select: { id: true } },
      },
    });

    // A closed requisition is reported as not found rather than forbidden: the
    // posting is simply no longer public, and there is nothing useful a
    // candidate could do with a more specific answer.
    if (!job) throw new NotFoundException('This job posting could not be found.');

    const firstStage = job.stages[0];
    if (!firstStage) {
      // A published requisition with no stages is our inconsistency, not
      // something the candidate did wrong.
      this.logger.error(`Published requisition ${job.id} has no stages`);
      throw new UnprocessableEntityException('This posting is not currently accepting applications.');
    }

    const sha256 = createHash('sha256').update(input.resume.buffer).digest('hex');

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const candidate = await this.identity.resolve(tx, job.orgId, {
          fullName: input.body.fullName,
          email: input.body.email,
          phone: input.body.phone,
          location: input.body.location,
          linkedinUrl: input.body.linkedinUrl,
          defaultCountry: 'IN',
        });

        const application = await tx.application.create({
          data: {
            orgId: job.orgId,
            jobId: job.id,
            candidateId: candidate.candidateId,
            currentStageId: firstStage.id,
            source: 'CAREERS_PAGE',
            coverLetter: input.body.coverLetter ?? null,
          },
          select: { id: true },
        });

        // Sequence 1. Every later event increments from here, and the unique
        // index on (applicationId, seq) makes a lost update impossible.
        //
        // actorType is CANDIDATE with a null actorId: they genuinely performed
        // this action, but they are not a User and never will be.
        await tx.applicationEvent.create({
          data: {
            orgId: job.orgId,
            applicationId: application.id,
            seq: 1,
            type: 'APPLICATION_RECEIVED',
            toStageId: firstStage.id,
            actorType: 'CANDIDATE',
            metadata: {
              source: 'CAREERS_PAGE',
              candidateWasNew: candidate.isNew,
              matchedOn: candidate.matchedOn,
            } as Prisma.InputJsonValue,
          },
        });

        await tx.document.create({
          data: {
            orgId: job.orgId,
            candidateId: candidate.candidateId,
            applicationId: application.id,
            // The bytes are held in memory for now. Object storage arrives with
            // MinIO, at which point storageKey becomes a real key and the
            // upload happens BEFORE this transaction opens — object storage is
            // not transactional, and an application row pointing at a file that
            // does not exist is a lost candidate.
            storageKey: `pending/${sha256}`,
            filename: input.resume.filename,
            mimeType: input.resume.mimeType,
            sizeBytes: input.resume.buffer.byteLength,
            sha256,
          },
        });

        return { applicationId: application.id, candidateWasNew: candidate.isNew };
      });

      this.logger.log(
        `Application ${result.applicationId} received for ${job.title} ` +
          `(candidate ${result.candidateWasNew ? 'new' : 'existing'})`,
      );

      return {
        applicationId: result.applicationId,
        status: 'RECEIVED',
        message: 'Your application has been received.',
      };
    } catch (error) {
      throw this.translate(error);
    }
  }

  /**
   * Turn a database race into an answer the candidate can act on.
   *
   * Hitting the partial unique index means this person already has a live
   * application for this role — a genuine second attempt, or a double submit.
   * Either way a 409 is more useful than an error, and far better than quietly
   * creating a duplicate.
   *
   * Synchronous on purpose: an async version returns a Promise, and `throw` on
   * a Promise surfaces as a 500 with the real cause hidden inside it.
   */
  private translate(error: unknown): unknown {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return error;
    }

    // Prisma reports meta.target as the COLUMN LIST behind the violated index,
    // not the index name — for a partial unique index it is
    // ['candidate_id', 'job_id'] rather than the constraint we named.
    const target = error.meta?.target;
    const columns = Array.isArray(target) ? target.map(String) : [String(target ?? '')];

    if (columns.includes('candidate_id') && columns.includes('job_id')) {
      return new ConflictException('You already have an application in progress for this role.');
    }
    return error;
  }
}
