import { Injectable } from '@nestjs/common';

@Injectable()
export class SubscriptionsService {
  listTemplates() {
    return {
      items: [
        {
          id: 'vless-reality-main',
          platformTargets: ['Windows', 'macOS', 'Android', 'iPhone/iPad'],
          qrReady: true,
        },
      ],
    };
  }
}
