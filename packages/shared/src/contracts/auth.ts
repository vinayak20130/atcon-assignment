import { z } from 'zod';
import type { UserRole } from '../enums';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'Password is required.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export interface AuthenticatedUser {
  id: string;
  orgId: string;
  email: string;
  fullName: string;
  role: UserRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResponse extends AuthTokens {
  user: AuthenticatedUser;
}

export interface AccessTokenClaims {
  sub: string;
  orgId: string;
  role: UserRole;
  email: string;
}
