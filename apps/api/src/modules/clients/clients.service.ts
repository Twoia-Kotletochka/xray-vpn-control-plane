import { Injectable } from '@nestjs/common';

import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { CreateClientDto } from './dto/create-client.dto';
import type { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  list(query: PaginationQueryDto) {
    return {
      items: [],
      pagination: {
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        total: 0,
      },
      filters: {
        search: query.search ?? null,
      },
    };
  }

  getById(clientId: string) {
    return {
      id: clientId,
      status: 'planned',
      message: 'Client detail flow will be implemented in the backend core phase.',
    };
  }

  create(payload: CreateClientDto) {
    return {
      status: 'planned',
      message: 'Client creation is scaffolded and will persist through Prisma next.',
      draft: payload,
    };
  }

  update(clientId: string, payload: UpdateClientDto) {
    return {
      id: clientId,
      status: 'planned',
      message: 'Client update flow will be implemented after Prisma migrations land.',
      draft: payload,
    };
  }
}
