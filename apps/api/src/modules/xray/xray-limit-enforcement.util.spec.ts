import { describe, expect, it } from 'vitest';

import {
  buildUserOnlineStatName,
  countOnlineIpEntries,
  describeClientLimitBreaches,
  evaluateClientLimitBreaches,
} from './xray-limit-enforcement.util';

describe('buildUserOnlineStatName', () => {
  it('builds the online stat counter name for a client', () => {
    expect(buildUserOnlineStatName('alice@example')).toBe('user>>>alice@example>>>online');
  });
});

describe('countOnlineIpEntries', () => {
  it('counts only non-empty IP keys', () => {
    expect(
      countOnlineIpEntries({
        '1.1.1.1': 1,
        '2.2.2.2': 1,
        '': 1,
      }),
    ).toBe(2);
  });
});

describe('evaluateClientLimitBreaches', () => {
  it('returns no breaches when both limits are unset', () => {
    expect(
      evaluateClientLimitBreaches({
        actualOnlineIps: 3,
        deviceLimit: null,
        ipLimit: null,
      }),
    ).toEqual([]);
  });

  it('returns an ip limit breach when concurrent online IPs exceed the limit', () => {
    expect(
      evaluateClientLimitBreaches({
        actualOnlineIps: 3,
        deviceLimit: null,
        ipLimit: 2,
      }),
    ).toEqual([
      {
        actual: 3,
        kind: 'ipLimit',
        limit: 2,
      },
    ]);
  });

  it('returns both breaches when both configured limits are exceeded', () => {
    expect(
      evaluateClientLimitBreaches({
        actualOnlineIps: 4,
        deviceLimit: 3,
        ipLimit: 2,
      }),
    ).toEqual([
      {
        actual: 4,
        kind: 'deviceLimit',
        limit: 3,
      },
      {
        actual: 4,
        kind: 'ipLimit',
        limit: 2,
      },
    ]);
  });
});

describe('describeClientLimitBreaches', () => {
  it('builds a readable summary for audit messages', () => {
    expect(
      describeClientLimitBreaches([
        {
          actual: 4,
          kind: 'deviceLimit',
          limit: 3,
        },
        {
          actual: 4,
          kind: 'ipLimit',
          limit: 2,
        },
      ]),
    ).toBe('device limit 3 and IP limit 2');
  });
});
