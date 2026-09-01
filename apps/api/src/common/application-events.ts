import { Prisma } from '@atcon/db';

/**
 * Append one entry to an application's event log.
 *
 * The sequence is read inside the caller's transaction rather than generated
 * beforehand. That is deliberate: the unique index on (applicationId, seq) is
 * the real guarantee, so two concurrent writers mean one commits and the other
 * fails the constraint loudly, instead of both claiming the same position and
 * one silently overwriting the other's place in history.
 */
export async function appendApplicationEvent(
  tx: Prisma.TransactionClient,
  event: {
    orgId: string;
    applicationId: string;
    type: Prisma.ApplicationEventCreateInput['type'];
    actorType: 'USER' | 'SYSTEM' | 'CANDIDATE';
    /** Null for SYSTEM and CANDIDATE — enforced by a check constraint. */
    actorId?: string | null;
    reason?: string | null;
    metadata: Record<string, unknown>;
  },
): Promise<number> {
  const latest = await tx.applicationEvent.findFirst({
    where: { applicationId: event.applicationId },
    orderBy: { seq: 'desc' },
    select: { seq: true },
  });
  const seq = (latest?.seq ?? 0) + 1;

  await tx.applicationEvent.create({
    data: {
      orgId: event.orgId,
      applicationId: event.applicationId,
      seq,
      type: event.type,
      actorType: event.actorType,
      actorId: event.actorId ?? null,
      reason: event.reason ?? null,
      metadata: event.metadata as Prisma.InputJsonValue,
    },
  });

  return seq;
}
