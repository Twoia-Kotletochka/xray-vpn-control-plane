import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin.interface';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { ExtendClientDto } from './dto/extend-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.clientsService.list(query);
  }

  @Get('export')
  exportClients() {
    return this.clientsService.exportClients();
  }

  @Post('import')
  importClients(
    @Body() payload: unknown,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() request: Request,
  ) {
    return this.clientsService.importClients(payload, admin, request);
  }

  @Get(':clientId')
  getById(@Param('clientId') clientId: string) {
    return this.clientsService.getById(clientId);
  }

  @Post()
  create(
    @Body() payload: CreateClientDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() request: Request,
  ) {
    return this.clientsService.create(payload, admin, request);
  }

  @Patch(':clientId')
  update(
    @Param('clientId') clientId: string,
    @Body() payload: UpdateClientDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() request: Request,
  ) {
    return this.clientsService.update(clientId, payload, admin, request);
  }

  @Post(':clientId/extend')
  extend(
    @Param('clientId') clientId: string,
    @Body() payload: ExtendClientDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() request: Request,
  ) {
    return this.clientsService.extend(clientId, payload, admin, request);
  }

  @Post(':clientId/reset-traffic')
  resetTraffic(
    @Param('clientId') clientId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() request: Request,
  ) {
    return this.clientsService.resetTraffic(clientId, admin, request);
  }

  @Delete(':clientId')
  remove(
    @Param('clientId') clientId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() request: Request,
  ) {
    return this.clientsService.remove(clientId, admin, request);
  }
}
