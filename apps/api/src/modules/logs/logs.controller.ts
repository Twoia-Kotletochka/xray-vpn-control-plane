import { Controller, Get, Param, Query } from '@nestjs/common';

import { LogsService } from './logs.service';

@Controller('logs')
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
