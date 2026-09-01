import { Injectable } from '@nestjs/common';
import type { Prisma } from '@atcon/db';
import { normalizeDisplayName, normalizeEmail, normalizePersonName, normalizePhone } from '@atcon/shared';

export interface ResolvedCandidate {
  candidateId: string;
  /** True when this application created the candidate record. */
  isNew: boolean;
  /** Which deterministic key matched an existing record, if any. */
  matchedOn: 'EMAIL' | 'PHONE' | null;
}

// Tier 1 of duplicate detection: deterministic identity resolution.
//
// This half must never guess. A normalized email or E.164 phone that already
// exists in the organization is the same person, full stop — resolved here,
// synchronously, inside the intake transaction, because a candidate applying
// twice must not produce two records even for a moment.
//
// Anything fuzzier (name similarity, employer overlap) belongs in a worker,
// where it can afford to be slower and less certain, because its output is a
// suggestion for a human rather than a decision.
@Injectable()
export class CandidateIdentityService {
  /**
   * Find or create the candidate this application belongs to.
   *
   * Must run inside the caller's transaction. The unique index on
   * (orgId, type, value) is the actual guarantee — two simultaneous
   * applications from the same person mean one loses the insert and falls
   * through to the lookup, rather than both creating a record.
   */
  async resolve(
    tx: Prisma.TransactionClient,
    orgId: string,
    input: {
      fullName: string;
      email: string;
      phone?: string | null;
      location?: string | null;
      linkedinUrl?: string | null;
      defaultCountry?: string;
    },
  ): Promise<ResolvedCandidate> {
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone, input.defaultCountry as never);
    const fullName = normalizeDisplayName(input.fullName);

    const lookups: Array<{ type: 'EMAIL' | 'PHONE'; value: string }> = [];
    if (email) lookups.push({ type: 'EMAIL', value: email.key });
    if (phone) lookups.push({ type: 'PHONE', value: phone.key });

    const existing = await tx.candidateIdentityKey.findFirst({
      where: { orgId, OR: lookups.map((lookup) => ({ type: lookup.type, value: lookup.value })) },
      select: { type: true, candidateId: true },
    });

    if (existing) {
      await this.backfillKeys(tx, orgId, existing.candidateId, lookups);
      await this.fillProfileGaps(tx, existing.candidateId, input);
      return {
        candidateId: existing.candidateId,
        isNew: false,
        matchedOn: existing.type as 'EMAIL' | 'PHONE',
      };
    }

    const candidate = await tx.candidate.create({
      data: {
        orgId,
        fullName,
        nameKey: normalizePersonName(fullName),
        primaryEmail: email?.display ?? null,
        primaryPhone: phone?.key ?? null,
        location: input.location ?? null,
        linkedinUrl: emptyToNull(input.linkedinUrl),
        identityKeys: {
          create: lookups.map((lookup) => ({ orgId, type: lookup.type, value: lookup.value })),
        },
      },
      select: { id: true },
    });

    return { candidateId: candidate.id, isNew: true, matchedOn: null };
  }

  /**
   * Record identity keys this application introduced.
   *
   * Someone who applied with only an email last year and includes a phone this
   * time becomes findable by both from now on. Written one at a time, because
   * one key colliding with a different candidate must not roll back the rest.
   */
  private async backfillKeys(
    tx: Prisma.TransactionClient,
    orgId: string,
    candidateId: string,
    keys: Array<{ type: 'EMAIL' | 'PHONE'; value: string }>,
  ): Promise<void> {
    for (const key of keys) {
      // A key already claimed by a DIFFERENT candidate is a genuine ambiguity —
      // two records that look like one person. Left alone for a human to rule
      // on; silently reassigning it would be an unreviewable merge.
      const claimed = await tx.candidateIdentityKey.findUnique({
        where: { orgId_type_value: { orgId, type: key.type, value: key.value } },
        select: { candidateId: true },
      });
      if (claimed) continue;

      await tx.candidateIdentityKey.create({
        data: { orgId, candidateId, type: key.type, value: key.value },
      });
    }
  }

  /**
   * Fill in profile fields that were previously blank.
   *
   * Only ever fills gaps, never overwrites — a recruiter may have corrected a
   * field by hand, and a later application must not silently undo that.
   */
  private async fillProfileGaps(
    tx: Prisma.TransactionClient,
    candidateId: string,
    input: { location?: string | null; linkedinUrl?: string | null },
  ): Promise<void> {
    const current = await tx.candidate.findUniqueOrThrow({
      where: { id: candidateId },
      select: { location: true, linkedinUrl: true },
    });

    const patch: Record<string, string> = {};
    if (!current.location && input.location) patch.location = input.location;
    if (!current.linkedinUrl && emptyToNull(input.linkedinUrl)) {
      patch.linkedinUrl = input.linkedinUrl as string;
    }

    if (Object.keys(patch).length > 0) {
      await tx.candidate.update({ where: { id: candidateId }, data: patch });
    }
  }
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}
