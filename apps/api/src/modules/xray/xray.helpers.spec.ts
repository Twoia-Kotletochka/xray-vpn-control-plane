import { describe, expect, it } from 'vitest';

import {
  buildTrafficDeltaMap,
  parseUserTrafficStatName,
  resolveObservedActiveConnections,
  startOfUtcDay,
} from './xray.helpers';

describe('parseUserTrafficStatName', () => {
  it('parses user traffic counters', () => {
    expect(parseUserTrafficStatName('user>>>alice@example>>>traffic>>>uplink')).toEqual({
      direction: 'uplink',
      emailTag: 'alice@example',
    });
  });

  it('ignores unrelated stats', () => {
    expect(parseUserTrafficStatName('inbound>>>main>>>traffic>>>uplink')).toBeNull();
  });
});

describe('buildTrafficDeltaMap', () => {
  it('aggregates uplink and downlink counters by email tag', () => {
    const usage = buildTrafficDeltaMap([
      {
        name: 'user>>>alice>>>traffic>>>uplink',
        value: '1024',
      },
      {
        name: 'user>>>alice>>>traffic>>>downlink',
        value: 2048,
      },
    ]);

    expect(usage.get('alice')).toEqual({
      incomingBytes: 2048n,
      outgoingBytes: 1024n,
      totalBytes: 3072n,
    });
  });
});

describe('startOfUtcDay', () => {
  it('normalizes a date to midnight UTC', () => {
    expect(startOfUtcDay(new Date('2026-03-20T16:42:10.000Z')).toISOString()).toBe(
      '2026-03-20T00:00:00.000Z',
    );
  });
});

describe('resolveObservedActiveConnections', () => {
  it('keeps a client online when xray reports presence even if per-user online stats fall back to zero', () => {
    expect(
      resolveObservedActiveConnections({
        emailTag: 'alice',
        onlineIpCountByEmailTag: new Map([['alice', 0]]),
        onlineUsers: new Set(['alice']),
      }),
    ).toBe(1);
  });

  it('prefers the higher online ip count when it is available', () => {
    expect(
      resolveObservedActiveConnections({
        emailTag: 'alice',
        onlineIpCountByEmailTag: new Map([['alice', 3]]),
        onlineUsers: new Set(['alice']),
      }),
    ).toBe(3);
  });

  it('returns zero when the client is not currently observed online', () => {
    expect(
      resolveObservedActiveConnections({
        emailTag: 'alice',
        onlineIpCountByEmailTag: new Map(),
        onlineUsers: new Set(),
      }),
    ).toBe(0);
  });
});
