import { Controller, Get, Post } from '@nestjs/common';
import { AdminRole } from '@prisma/client';

import { Roles } from '../../common/auth/roles.decorator';
import { XrayService } from './xray.service';

@Controller('xray')
@Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR, AdminRole.READ_ONLY)
export class XrayController {
  constructor(private readonly xrayService: XrayService) {}

  @Get('profiles')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR, AdminRole.READ_ONLY)
  async getProfiles() {
    return this.xrayService.getProfiles();
  }

  @Post('sync')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  async syncAll() {
    await this.xrayService.syncAllClients('manual-endpoint');
    return {
      success: true,
    };
  }

  @Post('snapshot')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  async snapshotUsage() {
    await this.xrayService.captureUsageSnapshot({
      force: true,
      reason: 'manual-endpoint',
    });

    return {
      success: true,
    };
  }
}
