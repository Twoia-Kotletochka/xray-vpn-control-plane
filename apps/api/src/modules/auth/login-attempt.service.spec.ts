import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import type { AppEnv } from '../../common/config/env.schema';
import { LoginAttemptService } from './login-attempt.service';

describe('LoginAttemptService', () => {
  it('blocks after the configured failure threshold', () => {
    const configService = {
      get(key: string) {
        if (key === 'LOGIN_RATE_LIMIT_TTL_MS') {
          return 60_000;
        }

        if (key === 'LOGIN_RATE_LIMIT_MAX') {
          return 2;
        }

        throw new Error(`Unexpected key: ${key}`);
      },
    } as unknown as ConfigService<AppEnv, true>;

    const service = new LoginAttemptService(configService);

    service.recordFailure('ip:user');
    service.recordFailure('ip:user');

    expect(() => service.assertAllowed('ip:user')).toThrowError(HttpException);
  });
});
