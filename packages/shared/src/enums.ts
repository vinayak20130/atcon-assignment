export const UserRole = {
  RECRUITER: "RECRUITER",
  INTERVIEWER: "INTERVIEWER",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export const ActorType = {
  /** A staff member. `actorId` points at users.id. */
  USER: 'USER',
  /** A worker or scheduled job. `actorId` is null. */
  SYSTEM: 'SYSTEM',
  /** The applicant acting on their own application. `actorId` is null. */
  CANDIDATE: 'CANDIDATE',
} as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];
/**
 * The semantic role of a stage, independent of its display name.
 *
 * A stage called "Founder Chat" and one called "Final Round" can both be
 * INTERVIEW. Metrics and guards key off this, never off the name, so a recruiter
 * renaming a stage cannot break analytics.
 */
export const StageType = {
  APPLIED: 'APPLIED',
  SCREEN: 'SCREEN',
  ASSESSMENT: 'ASSESSMENT',
  INTERVIEW: 'INTERVIEW',
  OFFER: 'OFFER',
  HIRED: 'HIRED',
  REJECTED: 'REJECTED',
} as const;
export type StageType = (typeof StageType)[keyof typeof StageType];

/** Stages an application cannot move out of without an explicit reopen. */
export const TERMINAL_STAGE_TYPES: readonly StageType[] = [StageType.HIRED, StageType.REJECTED];

export const JobStatus = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  PAUSED: 'PAUSED',
  CLOSED: 'CLOSED',
  FILLED: 'FILLED',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const EmploymentType = {
  FULL_TIME: 'FULL_TIME',
  PART_TIME: 'PART_TIME',
  CONTRACT: 'CONTRACT',
  INTERNSHIP: 'INTERNSHIP',
} as const;
export type EmploymentType = (typeof EmploymentType)[keyof typeof EmploymentType];

// Every interview is a video call, so there is no mode column. Recording the
// same value on every row would be storage pretending to be a decision; when a
// second mode genuinely exists, that is when the enum earns its place.

/**
 * NO_SHOW is deliberately distinct from CANCELLED.
 *
 * Both end the interview without scorecards, but only one is anybody's fault,
 * and a no-show rate is a number a recruiter actually wants. Collapsing them
 * would throw that away to save an enum member.
 */
export const InterviewStatus = {
  SCHEDULED: 'SCHEDULED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
} as const;
export type InterviewStatus = (typeof InterviewStatus)[keyof typeof InterviewStatus];

/** Interviews that still owe a verdict. */
export const OPEN_INTERVIEW_STATUSES: readonly InterviewStatus[] = [
  InterviewStatus.SCHEDULED,
  InterviewStatus.COMPLETED,
];

/**
 * Four options, no middle.
 *
 * An odd-numbered scale invites "3 — I'm not sure", which is the one answer a
 * hiring decision cannot use. Forcing a lean is the entire point of the scale.
 */
export const Recommendation = {
  STRONG_NO: 'STRONG_NO',
  NO: 'NO',
  YES: 'YES',
  STRONG_YES: 'STRONG_YES',
} as const;
export type Recommendation = (typeof Recommendation)[keyof typeof Recommendation];

export const RECOMMENDATION_WEIGHT: Readonly<Record<Recommendation, number>> = {
  STRONG_NO: -2,
  NO: -1,
  YES: 1,
  STRONG_YES: 2,
};
