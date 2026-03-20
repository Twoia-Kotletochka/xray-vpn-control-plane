import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

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
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.adminUser.count(),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
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
}
