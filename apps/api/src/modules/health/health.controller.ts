import { Controller, Get } from '@nestjs/common';

import type { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('healthz')
  getHealth() {
    return this.healthService.getHealth();
  }

  @Get('readyz')
  async getReadiness() {
    return this.healthService.getReadiness();
  }
}
