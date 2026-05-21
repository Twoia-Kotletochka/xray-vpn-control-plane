import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppEnv } from '../../common/config/env.schema';

type AttemptState = {
  failures: number;
  firstFailureAt: number;
  blockedUntil: number | null;
};

@Injectable()
export class LoginAttemptService {
  private readonly attempts = new Map<string, AttemptState>();

  constructor(private readonly configService: ConfigService<AppEnv, true>) {}

  assertAllowed(key: string): void {
    this.cleanup();

    const state = this.attempts.get(key);
    const now = Date.now();

    if (state?.blockedUntil && state.blockedUntil > now) {
      const retryAfterSeconds = Math.max(1, Math.ceil((state.blockedUntil - now) / 1_000));

      throw new HttpException(
        `Too many login attempts. Try again in ${retryAfterSeconds} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(key: string): void {
    this.cleanup();

    const ttlMs = this.configService.get('LOGIN_RATE_LIMIT_TTL_MS', { infer: true });
    const maxAttempts = this.configService.get('LOGIN_RATE_LIMIT_MAX', { infer: true });
    const now = Date.now();
    const current = this.attempts.get(key);

    if (!current || now - current.firstFailureAt > ttlMs) {
      this.attempts.set(key, {
        failures: 1,
        firstFailureAt: now,
        blockedUntil: null,
      });
      return;
    }

    const failures = current.failures + 1;

    this.attempts.set(key, {
      failures,
      firstFailureAt: current.firstFailureAt,
      blockedUntil: failures >= maxAttempts ? now + ttlMs : current.blockedUntil,
    });
  }

  clear(key: string): void {
    this.attempts.delete(key);
  }

  private cleanup(): void {
    const ttlMs = this.configService.get('LOGIN_RATE_LIMIT_TTL_MS', { infer: true });
    const now = Date.now();

    for (const [key, state] of this.attempts.entries()) {
      const isExpiredWindow = now - state.firstFailureAt > ttlMs;
      const isExpiredBlock = state.blockedUntil !== null && state.blockedUntil <= now;

      if (isExpiredWindow || isExpiredBlock) {
        this.attempts.delete(key);
      }
    }
  }
}
