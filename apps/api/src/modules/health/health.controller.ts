import { Controller, Get } from '@nestjs/common';

import { Public } from '../../common/auth/public.decorator';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get('healthz')
  getHealth() {
    return this.healthService.getHealth();
  }

  @Public()
  @Get('readyz')
  async getReadiness() {
    return this.healthService.getReadiness();
  }
}
