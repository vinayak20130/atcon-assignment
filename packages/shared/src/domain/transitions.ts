import { StageType, TERMINAL_STAGE_TYPES, UserRole } from '../enums';

// The pipeline state machine: classification and guards, no persistence.
//
// Everything here is a pure function over plain data. The caller loads the facts
// inside a transaction, asks this module for a decision, and only then writes.
// That split is what lets every rule below be unit tested without a database,
// and stops the rules quietly depending on request context they were never
// handed.

export interface StageRef {
  readonly id: string;
  /** Ordinal within the requisition's own stage list. Gaps are allowed. */
  readonly position: number;
  readonly type: StageType;
  readonly name: string;
  /** Advancing OUT of this stage requires every required scorecard submitted. */
  readonly requiresScorecard: boolean;
}

export interface TransitionActor {
  readonly id: string;
  readonly role: UserRole;
  /** Assigned to this requisition via JobAssignment. */
  readonly isAssignedToJob: boolean;
}

// Passing facts rather than repositories keeps this pure and makes the data
// each rule depends on explicit at the call site.
/** Mirrors the ApplicationStatus enum without importing Prisma. */
export type ApplicationStatusValue = 'ACTIVE' | 'HIRED' | 'REJECTED' | 'WITHDRAWN';

export interface TransitionFacts {
  readonly applicationStatus: ApplicationStatusValue;
  /** Server-side truth, compared against the caller's `fromStageId`. */
  readonly currentStageId: string;
  readonly jobStatus: 'DRAFT' | 'OPEN' | 'PAUSED' | 'CLOSED' | 'FILLED';
  /** Openings left on the requisition. Zero blocks a hire. */
  readonly openingsRemaining: number;
  /** Required-but-unsubmitted scorecards at the CURRENT stage. */
  readonly pendingScorecardCount: number;
  /** The requisition's stages, any order. */
  readonly stages: readonly StageRef[];
  readonly actor: TransitionActor;
}

export interface TransitionRequest {
  /**
   * The stage the caller believed the application was in.
   *
   * This is optimistic concurrency: two recruiters acting on a stale board mean
   * the second gets a clean conflict instead of silently overwriting the first
   * one's decision.
   */
  readonly fromStageId: string;
  readonly toStageId: string;
  readonly reason?: string | null;
}

export const TransitionKind = {
  ADVANCE: 'ADVANCE',
  REGRESS: 'REGRESS',
  REJECT: 'REJECT',
  WITHDRAW: 'WITHDRAW',
  HIRE: 'HIRE',
  REOPEN: 'REOPEN',
} as const;
export type TransitionKind = (typeof TransitionKind)[keyof typeof TransitionKind];

export const TransitionDenialCode = {
  UNKNOWN_STAGE: 'UNKNOWN_STAGE',
  STALE_STAGE: 'STALE_STAGE',
  SAME_STAGE: 'SAME_STAGE',
  NO_SCOPE: 'NO_SCOPE',
  ROLE_NOT_PERMITTED: 'ROLE_NOT_PERMITTED',
  TERMINAL_APPLICATION: 'TERMINAL_APPLICATION',
  SCORECARD_REQUIRED: 'SCORECARD_REQUIRED',
  NO_OPENINGS_REMAINING: 'NO_OPENINGS_REMAINING',
  JOB_NOT_ACCEPTING: 'JOB_NOT_ACCEPTING',
  REASON_REQUIRED: 'REASON_REQUIRED',
} as const;
export type TransitionDenialCode =
  (typeof TransitionDenialCode)[keyof typeof TransitionDenialCode];

export type TransitionDecision =
  | {
      readonly allowed: true;
      readonly kind: TransitionKind;
      readonly fromStage: StageRef;
      readonly toStage: StageRef;
      readonly resultingStatus: ApplicationStatusValue;
    }
  | {
      readonly allowed: false;
      readonly code: TransitionDenialCode;
      readonly message: string;
    };

// Kinds that must carry a written reason into the audit trail. A reversal
// nobody explained is a reversal nobody can review.
const REASON_REQUIRED_KINDS: readonly TransitionKind[] = [
  TransitionKind.REGRESS,
  TransitionKind.REJECT,
  TransitionKind.REOPEN,
];

// INTERVIEWER is absent by design: interviewers submit scorecards, they do not
// move candidates. Keeping evaluation and decision separate is the whole point
// of having a scorecard.
const ROLE_PERMISSIONS: Record<UserRole, readonly TransitionKind[]> = {
  [UserRole.RECRUITER]: [
    TransitionKind.ADVANCE,
    TransitionKind.REGRESS,
    TransitionKind.REJECT,
    TransitionKind.WITHDRAW,
    TransitionKind.HIRE,
    TransitionKind.REOPEN,
  ],
  [UserRole.INTERVIEWER]: [],
};

/** Job states that still accept forward movement. */
const FORWARD_MOVE_JOB_STATUSES = ['OPEN', 'PAUSED'];

function isTerminalStage(stage: StageRef): boolean {
  return TERMINAL_STAGE_TYPES.includes(stage.type);
}

/**
 * Name the move without judging it.
 *
 * Split out so the classification is testable on its own, and so a denial can
 * name the kind that was attempted.
 */
export function classifyTransition(
  from: StageRef,
  to: StageRef,
  applicationStatus: TransitionFacts['applicationStatus'],
): TransitionKind {
  // Coming back from a terminal state is a REOPEN whatever the direction.
  if (applicationStatus !== 'ACTIVE' && !isTerminalStage(to)) return TransitionKind.REOPEN;
  if (to.type === StageType.REJECTED) return TransitionKind.REJECT;
  if (to.type === StageType.HIRED) return TransitionKind.HIRE;
  return to.position > from.position ? TransitionKind.ADVANCE : TransitionKind.REGRESS;
}

function statusAfter(kind: TransitionKind): ApplicationStatusValue {
  switch (kind) {
    case TransitionKind.REJECT:
      return 'REJECTED';
    case TransitionKind.HIRE:
      return 'HIRED';
    case TransitionKind.WITHDRAW:
      return 'WITHDRAWN';
    default:
      return 'ACTIVE';
  }
}

function deny(code: TransitionDenialCode, message: string): TransitionDecision {
  return { allowed: false, code, message };
}

/**
 * Decide whether a requested move may be written.
 *
 * Guards run cheapest-and-most-fundamental first, so the denial a caller sees is
 * the most explanatory one: a stale board reports STALE_STAGE rather than
 * confusing them with a scorecard error about a stage they had already left.
 */
export function evaluateTransition(
  facts: TransitionFacts,
  request: TransitionRequest,
): TransitionDecision {
  const byId = new Map(facts.stages.map((stage) => [stage.id, stage]));

  const fromStage = byId.get(request.fromStageId);
  const toStage = byId.get(request.toStageId);
  if (!fromStage || !toStage) {
    return deny(
      TransitionDenialCode.UNKNOWN_STAGE,
      'That stage does not belong to this job requisition.',
    );
  }

  // Optimistic concurrency, before anything else: with a stale view every other
  // check would be reasoning about the wrong stage.
  if (facts.currentStageId !== request.fromStageId) {
    return deny(
      TransitionDenialCode.STALE_STAGE,
      'This application has already moved. Reload and try again.',
    );
  }

  if (fromStage.id === toStage.id) {
    return deny(TransitionDenialCode.SAME_STAGE, 'The application is already in that stage.');
  }

  if (facts.actor.role !== UserRole.RECRUITER || !facts.actor.isAssignedToJob) {
    return deny(TransitionDenialCode.NO_SCOPE, 'You are not assigned to this requisition.');
  }

  const kind = classifyTransition(fromStage, toStage, facts.applicationStatus);

  if (!ROLE_PERMISSIONS[facts.actor.role].includes(kind)) {
    return deny(
      TransitionDenialCode.ROLE_NOT_PERMITTED,
      `Your role cannot perform a ${kind.toLowerCase()} on this application.`,
    );
  }

  // A closed-out application is only re-openable through an explicit REOPEN, so
  // a stray drag on a board cannot resurrect a rejected candidate.
  if (facts.applicationStatus !== 'ACTIVE' && kind !== TransitionKind.REOPEN) {
    return deny(
      TransitionDenialCode.TERMINAL_APPLICATION,
      `This application is ${facts.applicationStatus.toLowerCase()}. Reopen it before moving it.`,
    );
  }

  if (REASON_REQUIRED_KINDS.includes(kind) && !request.reason?.trim()) {
    return deny(
      TransitionDenialCode.REASON_REQUIRED,
      `A reason is required to ${kind.toLowerCase()} an application.`,
    );
  }

  // Rejection stays legal on a closed or filled requisition — you still have to
  // close out the candidates who did not get the role.
  const isForwardMove = kind === TransitionKind.ADVANCE || kind === TransitionKind.HIRE;
  if (isForwardMove && !FORWARD_MOVE_JOB_STATUSES.includes(facts.jobStatus)) {
    return deny(
      TransitionDenialCode.JOB_NOT_ACCEPTING,
      `This requisition is ${facts.jobStatus.toLowerCase()} and cannot take further hires.`,
    );
  }

  // Scorecards block a direct hire out of a scored stage. An offer letter is
  // still an active-stage step recruiters can use to shortlist after interview.
  if (
    kind === TransitionKind.HIRE &&
    fromStage.requiresScorecard &&
    facts.pendingScorecardCount > 0
  ) {
    return deny(
      TransitionDenialCode.SCORECARD_REQUIRED,
      `${facts.pendingScorecardCount} scorecard(s) still outstanding for ${fromStage.name}.`,
    );
  }

  if (kind === TransitionKind.HIRE && facts.openingsRemaining <= 0) {
    return deny(
      TransitionDenialCode.NO_OPENINGS_REMAINING,
      'Every opening on this requisition is already filled.',
    );
  }

  return { allowed: true, kind, fromStage, toStage, resultingStatus: statusAfter(kind) };
}
