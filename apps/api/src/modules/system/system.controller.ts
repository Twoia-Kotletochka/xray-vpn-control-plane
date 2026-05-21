import { Controller, Get } from '@nestjs/common';
import { AdminRole } from '@prisma/client';

import { Roles } from '../../common/auth/roles.decorator';
import { SystemService } from './system.service';

@Controller('system')
@Roles(AdminRole.SUPER_ADMIN)
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('status')
  async status() {
    return this.systemService.status();
  }
}
