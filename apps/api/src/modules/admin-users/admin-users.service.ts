import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import type { Request } from 'express';

import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin.interface';
import type { AppEnv } from '../../common/config/env.schema';
import { PrismaService } from '../../common/database/prisma.service';
import { parseDurationToMs } from '../../common/utils/parse-duration';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  decryptTwoFactorSecret,
  encryptTwoFactorSecret,
} from '../auth/two-factor-secret.util';
import type { TwoFactorSetupPayload } from '../auth/auth.types';
import { buildTotpOtpAuthUrl, generateTotpSecret, verifyTotpCode } from '../auth/totp.util';
import type { DisableTwoFactorDto } from './dto/disable-two-factor.dto';
import type { EnableTwoFactorDto } from './dto/enable-two-factor.dto';
import type { StartTwoFactorSetupDto } from './dto/start-two-factor-setup.dto';

const TWO_FACTOR_SETUP_TTL = '10m';
const TWO_FACTOR_ISSUER = 'server-vpn';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppEnv, true>,
    private readonly jwtService: JwtService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async list() {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.adminUser.findMany({
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          isActive: true,
          totpSecretEnc: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.adminUser.count(),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        email: item.email,
        username: item.username,
        role: item.role,
        isActive: item.isActive,
        twoFactorEnabled: Boolean(item.totpSecretEnc),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      total,
      capabilities: {
        twoFactorReady: true,
        roleModel: ['SUPER_ADMIN', 'OPERATOR', 'READ_ONLY'],
      },
    };
  }

  async getSelfTwoFactorStatus(admin: AuthenticatedAdmin) {
    const currentAdmin = await this.requireAdmin(admin.id);

    return {
      enabled: Boolean(currentAdmin.totpSecretEnc),
    };
  }

  async startTwoFactorSetup(
    admin: AuthenticatedAdmin,
    input: StartTwoFactorSetupDto,
    request: Request,
  ) {
    const currentAdmin = await this.requireAdmin(admin.id);

    if (!currentAdmin.isActive) {
      throw new ForbiddenException('Admin account is disabled.');
    }

    if (currentAdmin.totpSecretEnc) {
      throw new ForbiddenException('Two-factor authentication is already enabled.');
    }

    const passwordMatches = await bcrypt.compare(input.password, currentAdmin.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Current password is invalid.');
    }

    const secret = generateTotpSecret();
    const expiresInMs = parseDurationToMs(TWO_FACTOR_SETUP_TTL);
    const setupToken = await this.jwtService.signAsync<TwoFactorSetupPayload>(
      {
        sub: currentAdmin.id,
        secret,
        type: 'two_factor_setup',
      },
      {
        secret: this.configService.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: Math.floor(expiresInMs / 1_000),
      },
    );

    return {
      enabled: false,
      setupToken,
      secret,
      issuer: TWO_FACTOR_ISSUER,
      accountLabel: currentAdmin.email,
      otpauthUrl: buildTotpOtpAuthUrl({
        secret,
        issuer: TWO_FACTOR_ISSUER,
        accountName: currentAdmin.email,
      }),
      expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
      verifiedBy: {
        ipAddress: this.getIpAddress(request) ?? null,
      },
    };
  }

  async enableTwoFactor(
    admin: AuthenticatedAdmin,
    input: EnableTwoFactorDto,
    request: Request,
  ) {
    const currentAdmin = await this.requireAdmin(admin.id);

    if (currentAdmin.totpSecretEnc) {
      throw new ForbiddenException('Two-factor authentication is already enabled.');
    }

    const payload = await this.verifySetupToken(input.setupToken, currentAdmin.id);

    if (!verifyTotpCode(payload.secret, input.code)) {
      throw new UnauthorizedException('Invalid two-factor code.');
    }

    await this.prisma.adminUser.update({
      where: {
        id: currentAdmin.id,
      },
      data: {
        totpSecretEnc: encryptTwoFactorSecret(
          payload.secret,
          this.configService.get('TOTP_ENCRYPTION_SECRET', { infer: true }),
        ),
      },
    });

    await this.auditLogService.write({
      actorAdminId: currentAdmin.id,
      action: 'ADMIN_UPDATED',
      entityType: 'admin_user',
      entityId: currentAdmin.id,
      summary: `Enabled two-factor authentication for ${currentAdmin.username}.`,
      ipAddress: this.getIpAddress(request),
      userAgent: request.get('user-agent') ?? undefined,
      metadata: {
        change: 'two_factor_enabled',
      },
    });

    return {
      enabled: true,
    };
  }

  async disableTwoFactor(
    admin: AuthenticatedAdmin,
    input: DisableTwoFactorDto,
    request: Request,
  ) {
    const currentAdmin = await this.requireAdmin(admin.id);

    if (!currentAdmin.totpSecretEnc) {
      throw new ForbiddenException('Two-factor authentication is already disabled.');
    }

    const passwordMatches = await bcrypt.compare(input.password, currentAdmin.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Current password is invalid.');
    }

    const decryptedSecret = decryptTwoFactorSecret(
      currentAdmin.totpSecretEnc,
      this.configService.get('TOTP_ENCRYPTION_SECRET', { infer: true }),
    );

    if (!verifyTotpCode(decryptedSecret, input.code)) {
      throw new UnauthorizedException('Invalid two-factor code.');
    }

    await this.prisma.adminUser.update({
      where: {
        id: currentAdmin.id,
      },
      data: {
        totpSecretEnc: null,
      },
    });

    await this.auditLogService.write({
      actorAdminId: currentAdmin.id,
      action: 'ADMIN_UPDATED',
      entityType: 'admin_user',
      entityId: currentAdmin.id,
      summary: `Disabled two-factor authentication for ${currentAdmin.username}.`,
      ipAddress: this.getIpAddress(request),
      userAgent: request.get('user-agent') ?? undefined,
      metadata: {
        change: 'two_factor_disabled',
      },
    });

    return {
      enabled: false,
    };
  }

  private async requireAdmin(adminUserId: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: {
        id: adminUserId,
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

    if (!admin) {
      throw new UnauthorizedException('Admin account is not available.');
    }

    return admin;
  }

  private async verifySetupToken(token: string, adminUserId: string) {
    try {
      const payload = await this.jwtService.verifyAsync<TwoFactorSetupPayload>(token, {
        secret: this.configService.get('JWT_ACCESS_SECRET', { infer: true }),
      });

      if (payload.type !== 'two_factor_setup' || payload.sub !== adminUserId) {
        throw new UnauthorizedException('Two-factor setup session expired. Start again.');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Two-factor setup session expired. Start again.');
    }
  }

  private getIpAddress(request: Request): string | undefined {
    return request.ip ?? undefined;
  }
}
