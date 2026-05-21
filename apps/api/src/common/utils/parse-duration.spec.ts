import { describe, expect, it } from 'vitest';

import { parseDurationToMs } from './parse-duration';

describe('parseDurationToMs', () => {
  it('parses shorthand durations', () => {
    expect(parseDurationToMs('15m')).toBe(900_000);
    expect(parseDurationToMs('30d')).toBe(2_592_000_000);
  });

  it('accepts raw millisecond strings', () => {
    expect(parseDurationToMs('60000')).toBe(60_000);
  });

  it('throws on unsupported duration shapes', () => {
    expect(() => parseDurationToMs('1w')).toThrowError();
  });
});
