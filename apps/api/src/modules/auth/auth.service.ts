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
import type { AccessTokenPayload, RefreshTokenPayload } from './auth.types';
import { LoginAttemptService } from './login-attempt.service';

import type { LoginDto } from './dto/login.dto';

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

    this.loginAttemptService.clear(loginKey);

    await this.prisma.adminSession.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }],
      },
    });

    const sessionPayload = await this.issueSession(admin.id, request, response, {
      email: admin.email,
      role: admin.role,
      username: admin.username,
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
      include: {
        adminUser: true,
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
      email: session.adminUser.email,
      role: session.adminUser.role,
      username: session.adminUser.username,
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

  me(admin: AuthenticatedAdmin) {
    return {
      admin,
    };
  }

  private async issueSession(
    adminUserId: string,
    request: Request,
    response: Response,
    admin: {
      email: string;
      role: AuthenticatedAdmin['role'];
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
      },
    };
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
