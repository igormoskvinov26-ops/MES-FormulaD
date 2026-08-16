import { describe, expect, it } from 'vitest';
import { slotFingerprint } from './fingerprint.js';

describe('slotFingerprint (anti-spam, spec §14)', () => {
  const base = { staffId: 101, date: '2026-08-16', slots: ['13:30', '16:00'] };

  it('is stable for identical input', () => {
    expect(slotFingerprint(base)).toBe(slotFingerprint(base));
  });

  it('is order-independent', () => {
    expect(slotFingerprint(base)).toBe(
      slotFingerprint({ ...base, slots: ['16:00', '13:30'] }),
    );
  });

  it('changes when slots change', () => {
    expect(slotFingerprint(base)).not.toBe(
      slotFingerprint({ ...base, slots: ['13:30', '16:30'] }),
    );
  });

  it('changes when staff or date change', () => {
    expect(slotFingerprint(base)).not.toBe(slotFingerprint({ ...base, staffId: 102 }));
    expect(slotFingerprint(base)).not.toBe(slotFingerprint({ ...base, date: '2026-08-17' }));
  });
});
