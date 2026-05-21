import { AdminRole, ClientStatus, TransportProfile } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  emptyClientUsage,
  resolveEffectiveClientStatus,
  serializeClientForAdmin,
} from './client-presenter';

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

  it('redacts sensitive client config for non-owning operators', () => {
    const serialized = serializeClientForAdmin(
      {
        id: 'client-1',
        createdByAdminUserId: 'super-admin',
        uuid: '11111111-1111-1111-1111-111111111111',
        emailTag: 'client-one',
        displayName: 'Client One',
        note: null,
        tags: ['shared'],
        status: ClientStatus.ACTIVE,
        createdAt: new Date('2026-05-03T10:00:00.000Z'),
        updatedAt: new Date('2026-05-03T10:00:00.000Z'),
        startsAt: null,
        expiresAt: null,
        durationDays: null,
        trafficLimitBytes: null,
        isTrafficUnlimited: true,
        deviceLimit: null,
        ipLimit: null,
        vlessEnabled: true,
        wireguardEnabled: true,
        subscriptionToken: 'subscription-token',
        transportProfile: TransportProfile.VLESS_REALITY_TCP,
        xrayInboundTag: 'vless-reality-main',
        lastActivatedAt: null,
        lastSeenAt: null,
        wireguardPeer: {
          assignedIpv4: '10.44.0.10',
          lastHandshakeAt: null,
        },
      },
      emptyClientUsage(),
      {
        id: 'operator-1',
        email: 'operator@example.com',
        username: 'operator',
        role: AdminRole.OPERATOR,
      },
    );

    expect(serialized.uuid).toBeNull();
    expect(serialized.subscriptionToken).toBeNull();
    expect(serialized.wireguardIpv4Address).toBeNull();
    expect(serialized.capabilities.canManage).toBe(false);
    expect(serialized.capabilities.canViewSensitiveConfig).toBe(false);
  });

  it('keeps sensitive client config available for the owning operator', () => {
    const serialized = serializeClientForAdmin(
      {
        id: 'client-2',
        createdByAdminUserId: 'operator-1',
        uuid: '22222222-2222-2222-2222-222222222222',
        emailTag: 'client-two',
        displayName: 'Client Two',
        note: null,
        tags: ['owned'],
        status: ClientStatus.ACTIVE,
        createdAt: new Date('2026-05-03T10:00:00.000Z'),
        updatedAt: new Date('2026-05-03T10:00:00.000Z'),
        startsAt: null,
        expiresAt: null,
        durationDays: null,
        trafficLimitBytes: null,
        isTrafficUnlimited: true,
        deviceLimit: null,
        ipLimit: null,
        vlessEnabled: true,
        wireguardEnabled: false,
        subscriptionToken: 'subscription-token-2',
        transportProfile: TransportProfile.VLESS_REALITY_TCP,
        xrayInboundTag: 'vless-reality-main',
        lastActivatedAt: null,
        lastSeenAt: null,
        wireguardPeer: null,
      },
      emptyClientUsage(),
      {
        id: 'operator-1',
        email: 'operator@example.com',
        username: 'operator',
        role: AdminRole.OPERATOR,
      },
    );

    expect(serialized.uuid).toBe('22222222-2222-2222-2222-222222222222');
    expect(serialized.subscriptionToken).toBe('subscription-token-2');
    expect(serialized.capabilities.canManage).toBe(true);
    expect(serialized.capabilities.canViewSensitiveConfig).toBe(true);
  });
});
