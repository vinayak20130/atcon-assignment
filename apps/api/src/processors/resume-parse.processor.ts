import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { Prisma } from '@atcon/db';
import { PrismaService } from '../modules/prisma/services/prisma.service';
import { StorageService } from '../modules/storage/services/storage.service';
import { ResumeParser } from '../modules/parsing/resume-parser';
import { QUEUE, type ResumeParseJob } from '../modules/queue/jobs';

// Parse an uploaded resume and attach the result to the candidate.
//
// This is the work that would otherwise have happened inside the application
// request. Doing it here is what makes a malformed PDF a recruiter's
// inconvenience rather than a lost application.
//
// Idempotent, because outbox delivery is at-least-once: the handler checks
// whether this document has already been parsed by this parser version and
// returns early rather than writing a second set of rows.
@Processor(QUEUE.RESUME_PARSE)
export class ResumeParseProcessor extends WorkerHost {
  private readonly logger = new Logger(ResumeParseProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly parser: ResumeParser,
  ) {
    super();
  }

  async process(job: Job<ResumeParseJob>): Promise<{ status: string }> {
    const { documentId, candidateId, applicationId } = job.data;

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, orgId: true, storageKey: true, parseStatus: true },
    });

    if (!document) {
      // Deleted between the outbox write and this job running — an intake that
      // rolled back, most likely. Nothing to do, and no reason to retry.
      this.logger.warn(`Document ${documentId} no longer exists; skipping parse`);
      return { status: 'skipped' };
    }

    if (document.parseStatus !== 'PENDING') {
      this.logger.debug(`Document ${documentId} already parsed; skipping`);
      return { status: 'already-parsed' };
    }

    const { parsed } = await this.parser.parse({
      buffer: await this.storage.get(document.storageKey),
      defaultCountry: 'IN',
    });

    const extractedAnything =
      parsed.email !== null || parsed.fullName !== null || parsed.experiences.length > 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: document.id },
        data: {
          parseStatus: !extractedAnything
            ? 'FAILED'
            : parsed.warnings.length === 0
              ? 'SUCCEEDED'
              : 'PARTIAL',
        },
      });

      // Fill gaps on the candidate profile; never overwrite. The application
      // form is what the candidate typed about themselves, and a regex over
      // their PDF does not get to override it.
      const candidate = await tx.candidate.findUniqueOrThrow({
        where: { id: candidateId },
        select: { linkedinUrl: true, skills: true },
      });

      const patch: Prisma.CandidateUpdateInput = {};
      if (!candidate.linkedinUrl && parsed.linkedinUrl) patch.linkedinUrl = parsed.linkedinUrl.value;
      // Skills are additive: a second resume listing fewer skills should not
      // shrink what we know about someone.
      if (parsed.skills.value.length > 0) {
        const merged = [...new Set([...candidate.skills, ...parsed.skills.value])].slice(0, 60);
        if (merged.length !== candidate.skills.length) patch.skills = merged;
      }
      if (Object.keys(patch).length > 0) {
        await tx.candidate.update({ where: { id: candidateId }, data: patch });
      }

      const latest = await tx.applicationEvent.findFirst({
        where: { applicationId },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      });

      await tx.applicationEvent.create({
        data: {
          orgId: document.orgId,
          applicationId,
          seq: (latest?.seq ?? 0) + 1,
          type: extractedAnything ? 'RESUME_PARSED' : 'RESUME_PARSE_FAILED',
          actorType: 'SYSTEM',
          metadata: {
            documentId: document.id,
            experiencesFound: parsed.experiences.length,
            skillsFound: parsed.skills.value.length,
            warnings: parsed.warnings,
          } as Prisma.InputJsonValue,
        },
      });
    });

    this.logger.log(
      `Parsed ${documentId}: ${parsed.experiences.length} roles, ` +
        `${parsed.skills.value.length} skills, ${parsed.warnings.length} warnings`,
    );
    return { status: extractedAnything ? 'parsed' : 'no-text-extracted' };
  }
}
