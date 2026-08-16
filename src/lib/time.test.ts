import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import {
  businessDateTime,
  isSlotInPast,
  isToday,
  isValidBusinessDate,
  reportDateLabel,
  todayMsk,
} from './time.js';

describe('time (Europe/Moscow business tz)', () => {
  it('todayMsk returns a YYYY-MM-DD string', () => {
    expect(todayMsk()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('isToday is true only for today', () => {
    expect(isToday(todayMsk())).toBe(true);
    expect(isToday('2000-01-01')).toBe(false);
  });

  it('validates dates', () => {
    expect(isValidBusinessDate('2026-08-16')).toBe(true);
    expect(isValidBusinessDate('2026-13-40')).toBe(false);
    expect(isValidBusinessDate('nonsense')).toBe(false);
  });

  it('isSlotInPast compares against a reference moment in MSK', () => {
    const ref = businessDateTime('2026-08-16', '15:00');
    expect(isSlotInPast('2026-08-16', '14:30', ref)).toBe(true); // before ref
    expect(isSlotInPast('2026-08-16', '15:00', ref)).toBe(true); // equal → past
    expect(isSlotInPast('2026-08-16', '15:30', ref)).toBe(false); // future
  });

  it('unparseable slot times are treated as past/unusable', () => {
    const ref = DateTime.fromISO('2026-08-16T15:00', { zone: 'Europe/Moscow' });
    expect(isSlotInPast('2026-08-16', 'zz:zz', ref)).toBe(true);
  });

  it('reportDateLabel renders Russian day + month', () => {
    expect(reportDateLabel('2026-08-16')).toBe('16 АВГУСТА');
    expect(reportDateLabel('2026-01-01')).toBe('1 ЯНВАРЯ');
  });
});
