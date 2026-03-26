import { AdminRole } from '@prisma/client';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin.interface';
import { AdminUsersService } from './admin-users.service';

function createAuthenticatedAdmin(
  role: AdminRole,
  overrides?: Partial<AuthenticatedAdmin>,
): AuthenticatedAdmin {
  return {
    id: overrides?.id ?? `${role.toLowerCase()}-1`,
    email: overrides?.email ?? `${role.toLowerCase()}@example.com`,
    username: overrides?.username ?? role.toLowerCase(),
    role,
  };
}

describe('AdminUsersService', () => {
  const now = new Date('2026-03-26T18:00:00.000Z');

  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    adminUser: {
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let configService: {
    get: ReturnType<typeof vi.fn>;
  };
  let auditLogService: {
    write: ReturnType<typeof vi.fn>;
  };
  let service: AdminUsersService;

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
      adminUser: {
        count: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };
    configService = {
      get: vi.fn((key: string) => {
        if (key === 'BCRYPT_ROUNDS') {
          return 4;
        }

        if (key === 'TOTP_ENCRYPTION_SECRET') {
          return 'totp-encryption-secret-1234567890';
        }

        if (key === 'JWT_ACCESS_SECRET') {
          return 'access-secret-12345678901234567890';
        }

        return undefined;
      }),
    };
    auditLogService = {
      write: vi.fn().mockResolvedValue(undefined),
    };
    service = new AdminUsersService(
      prisma as never,
      configService as never,
      {} as never,
      auditLogService as never,
    );
  });

  it('allows a super admin to create an operator account', async () => {
    const superAdmin = createAuthenticatedAdmin(AdminRole.SUPER_ADMIN);

    prisma.adminUser.findFirst.mockResolvedValue(null);
    prisma.adminUser.create.mockResolvedValue({
      id: 'operator-1',
      email: 'operator@example.com',
      username: 'operator',
      role: AdminRole.OPERATOR,
      isActive: true,
      totpSecretEnc: null,
      createdAt: now,
      updatedAt: now,
    });

    const result = await service.create(
      superAdmin,
      {
        email: 'Operator@Example.com',
        username: 'operator',
        password: 'super-secure-password',
      },
      {
        get: vi.fn().mockReturnValue('vitest'),
        ip: '127.0.0.1',
      } as never,
    );

    const createInput = prisma.adminUser.create.mock.calls[0]?.[0];
    const passwordHash = createInput?.data?.passwordHash as string;

    expect(createInput).toMatchObject({
      data: {
        email: 'operator@example.com',
        username: 'operator',
        role: AdminRole.OPERATOR,
        isActive: true,
      },
    });
    expect(await bcrypt.compare('super-secure-password', passwordHash)).toBe(true);
    expect(result).toMatchObject({
      id: 'operator-1',
      email: 'operator@example.com',
      username: 'operator',
      role: 'OPERATOR',
      canDelete: true,
      isCurrentAdmin: false,
      twoFactorEnabled: false,
    });
    expect(auditLogService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_CREATED',
        actorAdminId: superAdmin.id,
        entityId: 'operator-1',
      }),
    );
  });

  it('forbids non-super-admin accounts from creating admin users', async () => {
    const operator = createAuthenticatedAdmin(AdminRole.OPERATOR);

    await expect(
      service.create(
        operator,
        {
          email: 'operator-2@example.com',
          username: 'operator-2',
          password: 'super-secure-password',
        },
        {} as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.adminUser.findFirst).not.toHaveBeenCalled();
  });

  it('rejects duplicate email or username on admin creation', async () => {
    const superAdmin = createAuthenticatedAdmin(AdminRole.SUPER_ADMIN);

    prisma.adminUser.findFirst.mockResolvedValue({
      email: 'operator@example.com',
      username: 'operator',
    });

    await expect(
      service.create(
        superAdmin,
        {
          email: 'operator@example.com',
          username: 'operator-new',
          password: 'super-secure-password',
        },
        {} as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('prevents deleting self or super admin accounts', async () => {
    const superAdmin = createAuthenticatedAdmin(AdminRole.SUPER_ADMIN, {
      id: 'super-admin-1',
    });

    prisma.adminUser.findUnique.mockResolvedValueOnce({
      id: 'super-admin-1',
      email: 'admin@example.com',
      username: 'admin',
      role: AdminRole.SUPER_ADMIN,
      isActive: true,
      totpSecretEnc: null,
      createdAt: now,
      updatedAt: now,
    });

    await expect(service.remove(superAdmin, 'super-admin-1', {} as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    prisma.adminUser.findUnique.mockResolvedValueOnce({
      id: 'super-admin-2',
      email: 'admin-2@example.com',
      username: 'admin-2',
      role: AdminRole.SUPER_ADMIN,
      isActive: true,
      totpSecretEnc: null,
      createdAt: now,
      updatedAt: now,
    });

    await expect(service.remove(superAdmin, 'super-admin-2', {} as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows a super admin to delete an operator account', async () => {
    const superAdmin = createAuthenticatedAdmin(AdminRole.SUPER_ADMIN, {
      id: 'super-admin-1',
      username: 'admin',
    });

    prisma.adminUser.findUnique.mockResolvedValue({
      id: 'operator-1',
      email: 'operator@example.com',
      username: 'operator',
      role: AdminRole.OPERATOR,
      isActive: true,
      totpSecretEnc: null,
      createdAt: now,
      updatedAt: now,
    });
    prisma.adminUser.delete.mockResolvedValue({
      id: 'operator-1',
    });

    const result = await service.remove(
      superAdmin,
      'operator-1',
      {
        get: vi.fn().mockReturnValue('vitest'),
        ip: '127.0.0.1',
      } as never,
    );

    expect(prisma.adminUser.delete).toHaveBeenCalledWith({
      where: {
        id: 'operator-1',
      },
    });
    expect(result).toEqual({
      success: true,
      id: 'operator-1',
    });
    expect(auditLogService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_UPDATED',
        actorAdminId: 'super-admin-1',
        entityId: 'operator-1',
      }),
    );
  });

  it('marks only lower-level accounts as deletable in list response', async () => {
    const superAdmin = createAuthenticatedAdmin(AdminRole.SUPER_ADMIN, {
      id: 'super-admin-1',
    });

    prisma.adminUser.findMany.mockResolvedValue([
      {
        id: 'super-admin-1',
        email: 'admin@example.com',
        username: 'admin',
        role: AdminRole.SUPER_ADMIN,
        isActive: true,
        totpSecretEnc: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'operator-1',
        email: 'operator@example.com',
        username: 'operator',
        role: AdminRole.OPERATOR,
        isActive: true,
        totpSecretEnc: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    prisma.adminUser.count.mockResolvedValue(2);

    const result = await service.list(superAdmin);

    expect(result.capabilities).toMatchObject({
      canManageAdmins: true,
      manageableRoles: ['OPERATOR'],
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'super-admin-1',
        canDelete: false,
        isCurrentAdmin: true,
      }),
      expect.objectContaining({
        id: 'operator-1',
        canDelete: true,
        isCurrentAdmin: false,
      }),
    ]);
  });
});
