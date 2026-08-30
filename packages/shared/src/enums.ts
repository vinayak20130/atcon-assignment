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