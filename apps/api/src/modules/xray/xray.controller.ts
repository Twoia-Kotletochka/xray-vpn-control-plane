import { Controller, Get } from '@nestjs/common';

import { XrayService } from './xray.service';

@Controller('xray')
export class XrayController {
  constructor(private readonly xrayService: XrayService) {}

  @Get('profiles')
  getProfiles() {
    return this.xrayService.getProfiles();
  }
}
