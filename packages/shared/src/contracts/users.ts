import { z } from 'zod';
import { UserRole } from '../enums';

/**
 * Creating a colleague.
 *
 * Note what is absent: orgId. It is taken from the caller's token, never the
 * request body — otherwise anyone could create a user inside someone else's
 * organization, which is the single line where multi-tenant systems leak.
 */
export const userCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(2).max(120),
  role: z.enum([UserRole.RECRUITER, UserRole.INTERVIEWER]),
  /** Set by whoever invites them; a real system would email a set-password link. */
  password: z.string().min(12, 'Use at least 12 characters.').max(72),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
}
