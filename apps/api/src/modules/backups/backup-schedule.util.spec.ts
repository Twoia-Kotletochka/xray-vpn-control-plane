import { describe, expect, it } from 'vitest';

import { isAutomaticBackupDue } from './backup-schedule.util';

describe('isAutomaticBackupDue', () => {
  it('returns true when no successful backup exists yet', () => {
    expect(
      isAutomaticBackupDue({
        intervalDays: 5,
        latestSuccessfulBackupCreatedAt: null,
        now: new Date('2026-03-26T12:00:00.000Z'),
      }),
    ).toBe(true);
  });

  it('returns false when the latest successful backup is still within the interval', () => {
    expect(
      isAutomaticBackupDue({
        intervalDays: 5,
        latestSuccessfulBackupCreatedAt: new Date('2026-03-22T12:00:01.000Z'),
        now: new Date('2026-03-26T12:00:00.000Z'),
      }),
    ).toBe(false);
  });

  it('returns true once the full interval has elapsed', () => {
    expect(
      isAutomaticBackupDue({
        intervalDays: 5,
        latestSuccessfulBackupCreatedAt: new Date('2026-03-21T12:00:00.000Z'),
        now: new Date('2026-03-26T12:00:00.000Z'),
      }),
    ).toBe(true);
  });
});
