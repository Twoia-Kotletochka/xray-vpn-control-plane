import { Controller, Get, Query } from '@nestjs/common';

import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { AuditLogService } from './audit-log.service';

@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.auditLogService.list(query);
  }
}
