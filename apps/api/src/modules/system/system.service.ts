import { Injectable } from '@nestjs/common';

@Injectable()
export class SystemService {
  status() {
    return {
      services: [
        { name: 'api', status: 'up' },
        { name: 'postgres', status: 'unknown' },
        { name: 'xray', status: 'unknown' },
        { name: 'caddy', status: 'unknown' },
      ],
      message:
        'Runtime probing and restart actions will be implemented in the infra hardening phase.',
    };
  }
}
