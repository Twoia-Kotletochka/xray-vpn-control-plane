import { Injectable } from '@nestjs/common';

import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@Injectable()
export class AuditLogService {
  list(query: PaginationQueryDto) {
    return {
      items: [],
      pagination: {
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        total: 0,
      },
    };
  }
}
