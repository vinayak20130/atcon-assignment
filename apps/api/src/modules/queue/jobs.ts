// Queue and job definitions.
//
// Every payload carries `eventId` — the outbox row it came from — which is the
// idempotency key handlers use. Delivery is at-least-once, so a handler must be
// able to recognise work it has already done.

export const QUEUE = {
  RESUME_PARSE: 'resume.parse',
  MAINTENANCE: 'maintenance',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];
export const ALL_QUEUES: readonly QueueName[] = Object.values(QUEUE);

export interface JobEnvelope {
  eventId: string;
  orgId: string;
}

export interface ResumeParseJob extends JobEnvelope {
  documentId: string;
  applicationId: string;
  candidateId: string;
}

// Outbox eventType values, and the queue each is relayed to.
//
// Keeping the mapping in one table means the relay stays a dumb pipe: it never
// grows a switch statement that has to be kept in step with the producers.
export const EVENT_ROUTING = {
  'resume.parse.requested': QUEUE.RESUME_PARSE,
  'maintenance.requested': QUEUE.MAINTENANCE,
} as const satisfies Record<string, QueueName>;

/**
 * Resolve the queue for an event type, or null if nothing routes it.
 *
 * The own-property check is not defensive noise: eventType is read straight out
 * of the database, and a plain index lookup would happily return
 * Object.prototype.constructor for an event named "constructor" — handing the
 * relay a function to enqueue onto.
 */
export function queueForEvent(eventType: string): QueueName | null {
  if (!Object.hasOwn(EVENT_ROUTING, eventType)) return null;
  return (EVENT_ROUTING as Record<string, QueueName>)[eventType] ?? null;
}
