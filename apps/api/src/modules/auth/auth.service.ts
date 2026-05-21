import { createHash, randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';

import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin.interface';
import type { AppEnv } from '../../common/config/env.schema';
import { PrismaService } from '../../common/database/prisma.service';
import { parseDurationToMs } from '../../common/utils/parse-duration';
import { AuditLogService } from '../audit-log/audit-log.service';
import { decryptTwoFactorSecret } from './two-factor-secret.util';
import type {
  AccessTokenPayload,
  AuthAdminPayload,
  RefreshTokenPayload,
  TwoFactorChallengePayload,
} from './auth.types';
import { verifyTotpCode } from './totp.util';
import { LoginAttemptService } from './login-attempt.service';

import type { LoginDto } from './dto/login.dto';

const TWO_FACTOR_CHALLENGE_TTL = '5m';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppEnv, true>,
    private readonly jwtService: JwtService,
    private readonly auditLogService: AuditLogService,
    private readonly loginAttemptService: LoginAttemptService,
  ) {}

  async login(input: LoginDto, request: Request, response: Response) {
    const loginKey = this.getLoginRateLimitKey(request, input.username);
    this.loginAttemptService.assertAllowed(loginKey);

    const identifier = input.username.trim();
    const ipAddress = this.getIpAddress(request);
    const userAgent = request.get('user-agent') ?? undefined;

    const admin = await this.prisma.adminUser.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier.toLowerCase() }],
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        passwordHash: true,
        totpSecretEnc: true,
      },
    });

    if (!admin || !(await bcrypt.compare(input.password, admin.passwordHash))) {
      this.loginAttemptService.recordFailure(loginKey);
      await this.safeAuditWrite({
        action: 'LOGIN_FAILED',
        entityType: 'admin_user',
        entityId: admin?.id,
        summary: `Failed login attempt for ${identifier}.`,
        ipAddress,
        userAgent,
      });
      throw new UnauthorizedException('Invalid username or password.');
    }

    if (!admin.isActive) {
      this.loginAttemptService.recordFailure(loginKey);
      throw new ForbiddenException('Admin account is disabled.');
    }

    if (admin.totpSecretEnc) {
      if (!input.twoFactorCode) {
        return this.issueTwoFactorChallenge(admin);
      }

      if (!input.twoFactorChallengeToken) {
        this.loginAttemptService.recordFailure(loginKey);
        throw new UnauthorizedException('Two-factor session is missing. Start login again.');
      }

      await this.verifyTwoFactorChallenge(input.twoFactorChallengeToken, admin.id);

      const totpSecret = decryptTwoFactorSecret(
        admin.totpSecretEnc,
        this.configService.get('TOTP_ENCRYPTION_SECRET', { infer: true }),
      );

      if (!verifyTotpCode(totpSecret, input.twoFactorCode)) {
        this.loginAttemptService.recordFailure(loginKey);
        await this.safeAuditWrite({
          action: 'LOGIN_FAILED',
          entityType: 'admin_user',
          entityId: admin.id,
          summary: `Failed second-factor verification for ${identifier}.`,
          ipAddress,
          userAgent,
        });
        throw new UnauthorizedException('Invalid two-factor code.');
      }
    }

    this.loginAttemptService.clear(loginKey);

    await this.prisma.adminSession.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }],
      },
    });

    const sessionPayload = await this.issueSession(admin.id, request, response, {
      ...this.presentAdmin(admin),
    });

    await this.safeAuditWrite({
      actorAdminId: admin.id,
      action: 'LOGIN_SUCCESS',
      entityType: 'admin_user',
      entityId: admin.id,
      summary: `Admin ${admin.username} signed in.`,
      ipAddress,
      userAgent,
    });

    return sessionPayload;
  }

  async refresh(request: Request, response: Response) {
    const refreshToken = this.readRefreshToken(request);

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh session is missing.');
    }

    const payload = await this.verifyRefreshToken(refreshToken, response);
    const session = await this.prisma.adminSession.findUnique({
      where: {
        id: payload.sid,
      },
      select: {
        id: true,
        refreshTokenHash: true,
        expiresAt: true,
        revokedAt: true,
        adminUser: {
          select: {
            id: true,
            email: true,
            username: true,
            role: true,
            isActive: true,
            totpSecretEnc: true,
          },
        },
      },
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      this.clearRefreshCookie(response);
      throw new UnauthorizedException('Refresh session is no longer valid.');
    }

    if (session.refreshTokenHash !== this.hashToken(refreshToken)) {
      await this.prisma.adminSession.update({
        where: {
          id: session.id,
        },
        data: {
          revokedAt: new Date(),
        },
      });
      this.clearRefreshCookie(response);
      throw new UnauthorizedException('Refresh session is no longer valid.');
    }

    if (!session.adminUser.isActive) {
      this.clearRefreshCookie(response);
      throw new ForbiddenException('Admin account is disabled.');
    }

    return this.issueSession(session.adminUser.id, request, response, {
      ...this.presentAdmin(session.adminUser),
      sessionId: session.id,
    });
  }

  async logout(request: Request, response: Response) {
    const refreshToken = this.readRefreshToken(request);

    if (refreshToken) {
      try {
        const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken, {
          secret: this.configService.get('JWT_REFRESH_SECRET', { infer: true }),
        });

        await this.prisma.adminSession.updateMany({
          where: {
            id: payload.sid,
          },
          data: {
            revokedAt: new Date(),
          },
        });
      } catch {
        // Ignore invalid tokens on logout to keep the endpoint idempotent.
      }
    }

    this.clearRefreshCookie(response);

    return {
      success: true,
    };
  }

  async me(admin: AuthenticatedAdmin) {
    const currentAdmin = await this.prisma.adminUser.findUnique({
      where: {
        id: admin.id,
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        totpSecretEnc: true,
      },
    });

    return {
      admin: currentAdmin ? this.presentAdmin(currentAdmin) : { ...admin, twoFactorEnabled: false },
    };
  }

  private async issueSession(
    adminUserId: string,
    request: Request,
    response: Response,
    admin: {
      email: string;
      role: AuthenticatedAdmin['role'];
      twoFactorEnabled: boolean;
      username: string;
      sessionId?: string;
    },
  ) {
    const accessTokenTtl = this.configService.get('ACCESS_TOKEN_TTL', { infer: true });
    const refreshTokenTtl = this.configService.get('REFRESH_TOKEN_TTL', { infer: true });
    const accessTokenTtlSeconds = Math.floor(parseDurationToMs(accessTokenTtl) / 1_000);
    const refreshTokenTtlSeconds = Math.floor(parseDurationToMs(refreshTokenTtl) / 1_000);
    const refreshTokenTtlMs = refreshTokenTtlSeconds * 1_000;
    const sessionId = admin.sessionId ?? randomUUID();
    const refreshToken = await this.jwtService.signAsync<RefreshTokenPayload>(
      {
        sub: adminUserId,
        sid: sessionId,
        type: 'refresh',
      },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: refreshTokenTtlSeconds,
      },
    );
    const refreshTokenHash = this.hashToken(refreshToken);
    const sessionExpiresAt = new Date(Date.now() + refreshTokenTtlMs);

    await this.prisma.adminSession.upsert({
      where: {
        id: sessionId,
      },
      update: {
        refreshTokenHash,
        ipAddress: this.getIpAddress(request),
        userAgent: request.get('user-agent') ?? undefined,
        expiresAt: sessionExpiresAt,
        revokedAt: null,
      },
      create: {
        id: sessionId,
        adminUserId,
        refreshTokenHash,
        ipAddress: this.getIpAddress(request),
        userAgent: request.get('user-agent') ?? undefined,
        expiresAt: sessionExpiresAt,
      },
    });

    this.setRefreshCookie(response, refreshToken, refreshTokenTtlMs);

    const accessToken = await this.jwtService.signAsync<AccessTokenPayload>(
      {
        sub: adminUserId,
        username: admin.username,
        role: admin.role,
        type: 'access',
      },
      {
        secret: this.configService.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: accessTokenTtlSeconds,
      },
    );

    return {
      accessToken,
      accessTokenTtl,
      admin: {
        id: adminUserId,
        email: admin.email,
        username: admin.username,
        role: admin.role,
        twoFactorEnabled: admin.twoFactorEnabled,
      },
    };
  }

  private async issueTwoFactorChallenge(admin: {
    id: string;
    email: string;
    username: string;
    role: AuthenticatedAdmin['role'];
    totpSecretEnc: string | null;
  }) {
    const expiresInMs = parseDurationToMs(TWO_FACTOR_CHALLENGE_TTL);
    const challengeToken = await this.jwtService.signAsync<TwoFactorChallengePayload>(
      {
        sub: admin.id,
        username: admin.username,
        type: 'two_factor_challenge',
      },
      {
        secret: this.configService.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: Math.floor(expiresInMs / 1_000),
      },
    );

    return {
      requiresTwoFactor: true as const,
      challengeToken,
      challengeExpiresAt: new Date(Date.now() + expiresInMs).toISOString(),
      admin: this.presentAdmin(admin),
    };
  }

  private async verifyTwoFactorChallenge(token: string, adminUserId: string) {
    try {
      const payload = await this.jwtService.verifyAsync<TwoFactorChallengePayload>(token, {
        secret: this.configService.get('JWT_ACCESS_SECRET', { infer: true }),
      });

      if (payload.type !== 'two_factor_challenge' || payload.sub !== adminUserId) {
        throw new UnauthorizedException('Two-factor session is invalid. Start login again.');
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Two-factor session is invalid. Start login again.');
    }
  }

  private readRefreshToken(request: Request): string | null {
    const cookieName = this.configService.get('SESSION_COOKIE_NAME', { infer: true });
    const value = request.cookies?.[cookieName];

    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private async verifyRefreshToken(refreshToken: string, response: Response) {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET', { infer: true }),
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Refresh session is invalid.');
      }

      return payload;
    } catch {
      this.clearRefreshCookie(response);
      throw new UnauthorizedException('Refresh session is invalid.');
    }
  }

  private setRefreshCookie(response: Response, refreshToken: string, maxAge: number): void {
    response.cookie(this.configService.get('SESSION_COOKIE_NAME', { infer: true }), refreshToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.configService.get('NODE_ENV', { infer: true }) === 'production',
      path: '/api/auth',
      maxAge,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(this.configService.get('SESSION_COOKIE_NAME', { infer: true }), {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.configService.get('NODE_ENV', { infer: true }) === 'production',
      path: '/api/auth',
    });
  }

  private hashToken(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private presentAdmin(admin: {
    id: string;
    email: string;
    username: string;
    role: AuthenticatedAdmin['role'];
    totpSecretEnc?: string | null;
  }): AuthAdminPayload {
    return {
      id: admin.id,
      email: admin.email,
      username: admin.username,
      role: admin.role,
      twoFactorEnabled: Boolean(admin.totpSecretEnc),
    };
  }

  private getIpAddress(request: Request): string | undefined {
    return request.ip ?? undefined;
  }

  private getLoginRateLimitKey(request: Request, identifier: string): string {
    return `${this.getIpAddress(request) ?? 'unknown'}:${identifier.trim().toLowerCase()}`;
  }

  private async safeAuditWrite(params: {
    actorAdminId?: string;
    action: 'LOGIN_SUCCESS' | 'LOGIN_FAILED';
    entityType: string;
    entityId?: string;
    summary: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await this.auditLogService.write(params);
    } catch {
      // Authentication should remain available even if audit persistence flakes momentarily.
    }
  }
}
