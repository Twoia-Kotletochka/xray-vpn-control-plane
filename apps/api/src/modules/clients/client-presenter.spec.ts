import { ClientStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { resolveEffectiveClientStatus } from './client-presenter';

describe('resolveEffectiveClientStatus', () => {
  it('marks active expired clients as expired', () => {
    expect(
      resolveEffectiveClientStatus({
        status: ClientStatus.ACTIVE,
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      }),
    ).toBe(ClientStatus.EXPIRED);
  });

  it('keeps disabled and blocked clients untouched', () => {
    expect(
      resolveEffectiveClientStatus({
        isTrafficUnlimited: true,
        status: ClientStatus.DISABLED,
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
        trafficLimitBytes: null,
      }),
    ).toBe(ClientStatus.DISABLED);
    expect(
      resolveEffectiveClientStatus({
        isTrafficUnlimited: true,
        status: ClientStatus.BLOCKED,
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
        trafficLimitBytes: null,
      }),
    ).toBe(ClientStatus.BLOCKED);
  });

  it('marks clients as blocked when the traffic quota is exceeded', () => {
    expect(
      resolveEffectiveClientStatus({
        isTrafficUnlimited: false,
        status: ClientStatus.ACTIVE,
        expiresAt: null,
        trafficLimitBytes: 100n,
        trafficUsedBytes: 100n,
      }),
    ).toBe(ClientStatus.BLOCKED);
  });
});
