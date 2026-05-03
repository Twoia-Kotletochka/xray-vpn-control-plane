import { Controller, Get, Query } from '@nestjs/common';
import { AdminRole } from '@prisma/client';

import { Roles } from '../../common/auth/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuditLogService } from './audit-log.service';

@Controller('audit-log')
@Roles(AdminRole.SUPER_ADMIN)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.auditLogService.list(query);
  }
}
