import { describe, expect, it } from 'vitest';

import { formatBytes } from './format';

describe('formatBytes', () => {
  it('formats zero safely', () => {
    expect(formatBytes(0)).toBe('0 Б');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(2048)).toBe('2,0 КБ');
  });
});
