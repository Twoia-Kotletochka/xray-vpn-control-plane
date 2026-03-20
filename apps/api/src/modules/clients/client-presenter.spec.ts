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
        status: ClientStatus.DISABLED,
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      }),
    ).toBe(ClientStatus.DISABLED);
    expect(
      resolveEffectiveClientStatus({
        status: ClientStatus.BLOCKED,
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      }),
    ).toBe(ClientStatus.BLOCKED);
  });
});
