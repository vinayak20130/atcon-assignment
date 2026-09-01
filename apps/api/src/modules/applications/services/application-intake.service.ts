import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ApplicationSubmitInput, ApplicationSubmitResponse } from '@atcon/shared';
import { Prisma } from '@atcon/db';
import { PrismaService } from '../../prisma/services/prisma.service';
import { OutboxService } from '../../outbox/services/outbox.service';
import { StorageService } from '../../storage/services/storage.service';
import { CandidateIdentityService } from '../../candidates/services/candidate-identity.service';

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
    private readonly storage: StorageService,
    private readonly outbox: OutboxService,
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

    // Written to storage BEFORE the transaction opens. Storage is not
    // transactional, so doing it inside would mean either holding a database
    // transaction open across a write, or discovering the write failed after
    // committing a row that references it. An orphaned file costs nothing and
    // is swept on the failure path; an application row pointing at a file that
    // does not exist is a lost candidate.
    const stored = await this.storage.put({
      orgId: job.orgId,
      buffer: input.resume.buffer,
      filename: input.resume.filename,
    });

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

        const document = await tx.document.create({
          data: {
            orgId: job.orgId,
            candidateId: candidate.candidateId,
            applicationId: application.id,
            // The bytes are held in memory for now. Object storage arrives with
            // MinIO, at which point storageKey becomes a real key and the
            // upload happens BEFORE this transaction opens — object storage is
            // not transactional, and an application row pointing at a file that
            // does not exist is a lost candidate.
            storageKey: stored.storageKey,
            filename: input.resume.filename,
            mimeType: input.resume.mimeType,
            sizeBytes: stored.sizeBytes,
            sha256: stored.sha256,
          },
          select: { id: true },
        });

        // The side effect, committed with the state change that caused it.
        // Nothing is enqueued here — the intent is committed, and the relay
        // picks it up.
        await this.outbox.write(tx, {
          orgId: job.orgId,
          aggregateType: 'document',
          aggregateId: document.id,
          eventType: 'resume.parse.requested',
          payload: {
            documentId: document.id,
            applicationId: application.id,
            candidateId: candidate.candidateId,
          },
        });

        // Committed with the application itself, so a rolled-back intake can
        // never send a confirmation for an application that does not exist.
        await this.outbox.write(tx, {
          orgId: job.orgId,
          aggregateType: 'application',
          aggregateId: application.id,
          eventType: 'application.received',
          payload: { applicationId: application.id },
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
      // The transaction rolled back, so the file we wrote references nothing.
      // Clean it up on the way out rather than leaving litter.
      await this.storage.delete(stored.storageKey).catch(() => undefined);
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
