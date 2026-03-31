import { Controller, Get, Param, Query } from '@nestjs/common';
import { AdminRole } from '@prisma/client';

import { Roles } from '../../common/auth/roles.decorator';
import { LogsService } from './logs.service';

@Controller('logs')
@Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR, AdminRole.READ_ONLY)
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get('sources')
  listSources() {
    return this.logsService.listSources();
  }

  @Get(':sourceId')
  getSource(@Param('sourceId') sourceId: string, @Query('lines') lines?: string) {
    return this.logsService.readSource(sourceId, Number(lines) || 200);
  }
}
