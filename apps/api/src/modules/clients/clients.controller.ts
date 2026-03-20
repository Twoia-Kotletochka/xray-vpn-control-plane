import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ClientsService } from './clients.service';
import type { CreateClientDto } from './dto/create-client.dto';
import type { UpdateClientDto } from './dto/update-client.dto';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.clientsService.list(query);
  }

  @Get(':clientId')
  getById(@Param('clientId') clientId: string) {
    return this.clientsService.getById(clientId);
  }

  @Post()
  create(@Body() payload: CreateClientDto) {
    return this.clientsService.create(payload);
  }

  @Patch(':clientId')
  update(@Param('clientId') clientId: string, @Body() payload: UpdateClientDto) {
    return this.clientsService.update(clientId, payload);
  }
}
