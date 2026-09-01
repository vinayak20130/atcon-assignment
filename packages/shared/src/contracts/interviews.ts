import { z } from 'zod';

// Wire shapes for scheduling and scoring. Validation lives here rather than in
// DTO classes so the same schema can type a Next.js form and a Nest route.

export const scheduleInterviewSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    /** Panelists. The first required member is enough to gate a stage. */
    panelists: z
      .array(
        z.object({
          userId: z.string().uuid(),
          // Backups are invited without owing feedback, which is what keeps a
          // dropped-out interviewer from blocking the pipeline forever.
          isRequired: z.boolean().default(true),
        }),
      )
      .min(1)
      .max(8),
    scheduledStart: z.coerce.date(),
    scheduledEnd: z.coerce.date(),
    /** IANA zone. Stored so a rescheduling recruiter sees the original intent. */
    timezone: z.string().trim().min(1).max(64).default('Asia/Kolkata'),
    /** The Cal.com booking this interview corresponds to. */
    bookingUrl: z.string().url().max(500).optional(),
    meetingUrl: z.string().url().max(500).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((value) => value.scheduledEnd > value.scheduledStart, {
    message: 'The interview must end after it starts.',
    path: ['scheduledEnd'],
  })
  .refine(
    (value) => new Set(value.panelists.map((panelist) => panelist.userId)).size === value.panelists.length,
    { message: 'The same person cannot be on the panel twice.', path: ['panelists'] },
  )
  .refine((value) => value.panelists.some((panelist) => panelist.isRequired), {
    message: 'At least one panelist must be required to submit a scorecard.',
    path: ['panelists'],
  });

export type ScheduleInterviewInput = z.infer<typeof scheduleInterviewSchema>;

export const concludeInterviewSchema = z.object({
  // Only the two endings a recruiter records by hand. COMPLETED is the normal
  // one; CANCELLED is separate because it takes a reason.
  outcome: z.enum(['COMPLETED', 'NO_SHOW']),
});
export type ConcludeInterviewInput = z.infer<typeof concludeInterviewSchema>;

export const cancelInterviewSchema = z.object({
  reason: z.string().trim().min(3).max(2000),
});
export type CancelInterviewInput = z.infer<typeof cancelInterviewSchema>;

export const saveScorecardSchema = z.object({
  ratings: z
    .array(
      z.object({
        criterionId: z.string().uuid(),
        rating: z.number().int().min(1).max(10),
        notes: z.string().trim().max(2000).optional(),
      }),
    )
    .max(20),
  recommendation: z.enum(['STRONG_NO', 'NO', 'YES', 'STRONG_YES']).optional(),
  summary: z.string().trim().max(5000).optional(),
  /**
   * Draft or final.
   *
   * A draft is saved loosely; submitting runs the full validation and is what
   * makes the scorecard readable by the rest of the panel. Splitting the two
   * means an interviewer can save notes mid-call without publishing them.
   */
  submit: z.boolean().default(false),
});
export type SaveScorecardInput = z.infer<typeof saveScorecardSchema>;

export const listInterviewsQuerySchema = z.object({
  applicationId: z.string().uuid().optional(),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListInterviewsQuery = z.infer<typeof listInterviewsQuerySchema>;
