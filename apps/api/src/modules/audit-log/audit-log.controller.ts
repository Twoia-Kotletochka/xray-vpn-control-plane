import { Controller, Get, Query } from '@nestjs/common';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuditLogService } from './audit-log.service';

@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.auditLogService.list(query);
  }
}
