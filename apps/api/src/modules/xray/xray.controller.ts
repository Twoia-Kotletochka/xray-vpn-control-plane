import { Controller, Get, Post } from '@nestjs/common';
import { AdminRole } from '@prisma/client';

import { Roles } from '../../common/auth/roles.decorator';
import { XrayService } from './xray.service';

@Controller('xray')
@Roles(AdminRole.SUPER_ADMIN)
export class XrayController {
  constructor(private readonly xrayService: XrayService) {}

  @Get('profiles')
  async getProfiles() {
    return this.xrayService.getProfiles();
  }

  @Post('sync')
  async syncAll() {
    await this.xrayService.syncAllClients('manual-endpoint');
    return {
      success: true,
    };
  }

  @Post('snapshot')
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
