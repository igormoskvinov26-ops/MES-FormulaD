import { describe, expect, it } from 'vitest';
import { computeAverageCheck } from './report.js';

describe('computeAverageCheck (spec §17)', () => {
  it('uses revenue / paid visits when available', () => {
    expect(computeAverageCheck(28400, 12, 15)).toBe(Math.round(28400 / 12));
  });

  it('falls back to completed visits when paid count missing', () => {
    expect(computeAverageCheck(28400, null, 10)).toBe(2840);
  });

  it('returns null when revenue is unknown (never a bogus average)', () => {
    expect(computeAverageCheck(null, 12, 15)).toBeNull();
  });

  it('returns null when there is no denominator', () => {
    expect(computeAverageCheck(28400, 0, 0)).toBeNull();
    expect(computeAverageCheck(28400, null, null)).toBeNull();
  });
});
