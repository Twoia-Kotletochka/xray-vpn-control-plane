import { Injectable } from '@nestjs/common';

@Injectable()
export class DashboardService {
  summary() {
    return {
      totals: {
        clients: 0,
        active: 0,
        expired: 0,
        disabled: 0,
        totalTrafficBytes: 0,
      },
      host: {
        cpuPercent: null,
        ramPercent: null,
        diskPercent: null,
      },
      message: 'Dashboard aggregation pipeline will be implemented after the persistence layer.',
    };
  }
}
