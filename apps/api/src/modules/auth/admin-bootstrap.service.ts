import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';

import type { AppEnv } from '../../common/config/env.schema';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppEnv, true>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async onModuleInit(): Promise<void> {
    const adminsCount = await this.prisma.adminUser.count();

    if (adminsCount > 0) {
      return;
    }

    const email = this.configService.get('INITIAL_ADMIN_EMAIL', { infer: true }).toLowerCase();
    const username = this.configService.get('INITIAL_ADMIN_USERNAME', { infer: true }).trim();
    const password = this.configService.get('INITIAL_ADMIN_PASSWORD', { infer: true });
    const bcryptRounds = this.configService.get('BCRYPT_ROUNDS', { infer: true });
    const passwordHash = await bcrypt.hash(password, bcryptRounds);

    const admin = await this.prisma.adminUser.create({
      data: {
        email,
        username,
        passwordHash,
      },
    });

    await this.auditLogService.write({
      action: 'ADMIN_CREATED',
      entityType: 'admin_user',
      entityId: admin.id,
      summary: 'Bootstrap admin user created from environment configuration.',
      metadata: {
        username: admin.username,
      },
    });
  }
}
