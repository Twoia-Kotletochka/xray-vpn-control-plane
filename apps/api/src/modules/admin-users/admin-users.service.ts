import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminRole } from '@prisma/client';
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
import type { CreateAdminUserDto } from './dto/create-admin-user.dto';
import type { DisableTwoFactorDto } from './dto/disable-two-factor.dto';
import type { EnableTwoFactorDto } from './dto/enable-two-factor.dto';
import type { StartTwoFactorSetupDto } from './dto/start-two-factor-setup.dto';

const TWO_FACTOR_SETUP_TTL = '10m';
const TWO_FACTOR_ISSUER = 'server-vpn';
const ADMIN_ROLE_MODEL = ['SUPER_ADMIN', 'OPERATOR', 'READ_ONLY'] as const;
const MANAGEABLE_ADMIN_ROLES = ['OPERATOR'] as const;

type ListedAdminUser = {
  id: string;
  email: string;
  username: string;
  role: AdminRole;
  isActive: boolean;
  totpSecretEnc: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppEnv, true>,
    private readonly jwtService: JwtService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async list(admin: AuthenticatedAdmin) {
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
      items: items.map((item) => this.serializeAdminUser(item, admin)),
      total,
      capabilities: {
        twoFactorReady: true,
        canManageAdmins: this.canManageAdmins(admin),
        manageableRoles: this.canManageAdmins(admin) ? [...MANAGEABLE_ADMIN_ROLES] : [],
        roleModel: [...ADMIN_ROLE_MODEL],
      },
    };
  }

  async create(admin: AuthenticatedAdmin, input: CreateAdminUserDto, request: Request) {
    this.assertCanManageAdmins(admin);

    const email = input.email.trim().toLowerCase();
    const username = input.username.trim();
    const existing = await this.prisma.adminUser.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
      select: {
        email: true,
        username: true,
      },
    });

    if (existing?.email === email) {
      throw new ConflictException('Admin email is already in use.');
    }

    if (existing?.username === username) {
      throw new ConflictException('Admin username is already in use.');
    }

    const passwordHash = await bcrypt.hash(
      input.password,
      this.configService.get('BCRYPT_ROUNDS', { infer: true }),
    );
    const created = await this.prisma.adminUser.create({
      data: {
        email,
        username,
        passwordHash,
        role: AdminRole.OPERATOR,
        isActive: true,
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
    });

    await this.auditLogService.write({
      actorAdminId: admin.id,
      action: 'ADMIN_CREATED',
      entityType: 'admin_user',
      entityId: created.id,
      summary: `Operator ${created.username} created by ${admin.username}.`,
      metadata: {
        role: created.role,
      },
      ipAddress: this.getIpAddress(request),
      userAgent: request.get('user-agent') ?? undefined,
    });

    return this.serializeAdminUser(created, admin);
  }

  async remove(admin: AuthenticatedAdmin, adminUserId: string, request: Request) {
    this.assertCanManageAdmins(admin);

    const target = await this.prisma.adminUser.findUnique({
      where: {
        id: adminUserId,
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
    });

    if (!target) {
      throw new NotFoundException('Admin account was not found.');
    }

    if (target.id === admin.id) {
      throw new ForbiddenException('You cannot delete your own admin account.');
    }

    if (target.role === AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException('Super admin accounts cannot be deleted from the panel.');
    }

    await this.prisma.adminUser.delete({
      where: {
        id: target.id,
      },
    });

    await this.auditLogService.write({
      actorAdminId: admin.id,
      action: 'ADMIN_UPDATED',
      entityType: 'admin_user',
      entityId: target.id,
      summary: `Admin user ${target.username} deleted by ${admin.username}.`,
      metadata: {
        change: 'deleted',
        deletedRole: target.role,
      },
      ipAddress: this.getIpAddress(request),
      userAgent: request.get('user-agent') ?? undefined,
    });

    return {
      success: true,
      id: target.id,
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

  private canManageAdmins(admin: Pick<AuthenticatedAdmin, 'role'>) {
    return admin.role === AdminRole.SUPER_ADMIN;
  }

  private assertCanManageAdmins(admin: Pick<AuthenticatedAdmin, 'role'>) {
    if (!this.canManageAdmins(admin)) {
      throw new ForbiddenException('Only super admins can manage admin accounts.');
    }
  }

  private serializeAdminUser(item: ListedAdminUser, currentAdmin: AuthenticatedAdmin) {
    return {
      id: item.id,
      email: item.email,
      username: item.username,
      role: item.role,
      isActive: item.isActive,
      twoFactorEnabled: Boolean(item.totpSecretEnc),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      isCurrentAdmin: item.id === currentAdmin.id,
      canDelete:
        this.canManageAdmins(currentAdmin) &&
        item.id !== currentAdmin.id &&
        item.role !== AdminRole.SUPER_ADMIN,
    };
  }
}
