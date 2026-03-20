import { Controller, Get } from '@nestjs/common';

import type { SystemService } from './system.service';

@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('status')
  status() {
    return this.systemService.status();
  }
}
