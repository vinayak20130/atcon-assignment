import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenClaims, AuthenticatedUser, LoginResponse, UserRole } from '@atcon/shared';
import { hashPassword, verifyPassword } from '@atcon/shared/server';
import { APP_CONFIG } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import { PrismaService } from '../../prisma/services/prisma.service';

/**
 * Authentication with rotating refresh tokens.
 *
 * Access tokens are short-lived and stateless. Refresh tokens are long-lived, so
 * they are stored — hashed — and rotated on every use. Presenting a token that
 * has already been rotated is the classic signal of theft, and is handled by
 * revoking the whole chain rather than refusing the single request.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /**
   * A real hash of a value nobody knows, computed once at startup.
   *
   * Login verifies against this when the account does not exist, so a missing
   * account and a wrong password cost the same time. Without it the endpoint is
   * an account-enumeration oracle answerable with a stopwatch.
   */
  private readonly absentUserHash = hashPassword(randomBytes(32).toString('hex'));

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: Env,
  ) {}

  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.prisma.user.findFirst({ where: { email: email.toLowerCase() } });

    const hash = user?.passwordHash ?? (await this.absentUserHash);
    const passwordMatches = await verifyPassword(password, hash);

    if (!user || !passwordMatches || !user.isActive) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    return this.issueSession(this.toAuthenticatedUser(user));
  }

  async refresh(presented: string): Promise<LoginResponse> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(presented) },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }

    if (stored.revokedAt) {
      // Reuse of a rotated token: assume theft and cut the whole family,
      // forcing a fresh login on every device.
      this.logger.warn(`Refresh token reuse for user ${stored.userId} — revoking all sessions`);
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Session is no longer valid. Please sign in again.');
    }

    if (!stored.user.isActive) throw new UnauthorizedException('This account is disabled.');

    const session = await this.issueSession(this.toAuthenticatedUser(stored.user));
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return session;
  }

  async logout(presented: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(presented), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Verifies an access token and returns the CURRENT user, not the token's copy. */
  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: this.config.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Access token is invalid or expired.');
    }

    // Re-read rather than trusting the token's role: a demotion or deactivation
    // must take effect within the token TTL, not whenever the user next logs in.
    const user = await this.prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('This account is no longer active.');
    }
    return this.toAuthenticatedUser(user);
  }

  private async issueSession(user: AuthenticatedUser): Promise<LoginResponse> {
    const claims: AccessTokenClaims = {
      sub: user.id,
      orgId: user.orgId,
      role: user.role,
      email: user.email,
    };

    const accessToken = await this.jwt.signAsync(claims, {
      secret: this.config.JWT_SECRET,
      expiresIn: this.config.JWT_ACCESS_TTL,
    });

    // Refresh tokens are opaque random strings, not JWTs: they are checked
    // against the database on every use anyway, so signing them would add
    // nothing but a second place for a secret to leak from.
    const refreshToken = randomBytes(48).toString('base64url');

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + durationToMs(this.config.JWT_REFRESH_TTL)),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: Math.floor(durationToMs(this.config.JWT_ACCESS_TTL) / 1000),
      user,
    };
  }

  private toAuthenticatedUser(user: {
    id: string;
    orgId: string;
    email: string;
    fullName: string;
    role: string;
  }): AuthenticatedUser {
    return {
      id: user.id,
      orgId: user.orgId,
      email: user.email,
      fullName: user.fullName,
      role: user.role as UserRole,
    };
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function durationToMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) throw new Error(`Unsupported duration: ${duration}`);
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 's'];
  return Number(match[1]) * multiplier;
}
