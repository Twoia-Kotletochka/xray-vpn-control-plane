import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppEnv } from '../../common/config/env.schema';

@Injectable()
export class XrayService {
  constructor(private readonly configService: ConfigService<AppEnv, true>) {}

  getProfiles() {
    return {
      items: [
        {
          id: this.configService.get('XRAY_INBOUND_TAG', { infer: true }),
          transport: 'vless-reality-tcp',
          listenPort: this.configService.get('XRAY_VLESS_PORT', { infer: true }),
          status: 'planned',
        },
      ],
    };
  }
}
