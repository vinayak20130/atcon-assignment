import { z } from 'zod';

// Deliberately short. Every extra required field on a careers form costs real
// applicants, and everything else here can be parsed from the resume or asked
// for later. Phone is requested but optional: it is the second deterministic
// dedupe key and materially improves identity resolution.
export const applicationSubmitSchema = z.object({
  fullName: z.string().trim().min(2, 'Please give your full name.').max(120),
  email: z.string().trim().toLowerCase().email('That does not look like an email address.'),
  phone: z.string().trim().max(32).optional(),
  location: z.string().trim().max(120).optional(),
  linkedinUrl: z.string().trim().url().max(300).optional().or(z.literal('')),
  coverLetter: z.string().trim().max(10_000).optional(),

  // Honeypot. A real browser leaves this hidden field alone; naive bots fill
  // every input they find.
  //
  // Accepted as an ordinary string on purpose. Rejecting it in the schema would
  // answer with a 422 naming the field, which tells whoever wrote the bot
  // exactly which input to stop filling — turning a working trap into a
  // tutorial. The handler checks it and returns an ordinary success instead.
  website: z.string().max(300).optional(),
});
export type ApplicationSubmitInput = z.infer<typeof applicationSubmitSchema>;

export interface ApplicationSubmitResponse {
  applicationId: string;
  status: string;
  message: string;
}

export const publicJobQuerySchema = z.object({
  department: z.string().trim().max(80).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type PublicJobQuery = z.infer<typeof publicJobQuerySchema>;
