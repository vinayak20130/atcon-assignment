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
