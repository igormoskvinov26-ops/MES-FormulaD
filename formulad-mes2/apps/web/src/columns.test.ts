import { describe, it, expect } from 'vitest';
import { COLUMNS, COMPACT_VISIBLE, DEFAULT_VISIBLE } from './columns';

describe('columns', () => {
  it('COMPACT_VISIBLE contains vin', () => {
    expect(COMPACT_VISIBLE).toContain('vin');
  });

  it('COMPACT_VISIBLE is a subset of COLUMNS keys', () => {
    const keys = COLUMNS.map((c) => c.key);
    for (const k of COMPACT_VISIBLE) {
      expect(keys).toContain(k);
    }
  });

  it('COMPACT_VISIBLE is shorter than DEFAULT_VISIBLE', () => {
    expect(COMPACT_VISIBLE.length).toBeLessThan(DEFAULT_VISIBLE.length);
  });
});
