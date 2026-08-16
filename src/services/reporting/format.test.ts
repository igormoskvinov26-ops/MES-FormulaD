import { describe, expect, it } from 'vitest';
import { formatDailyReport, money, num } from './format.js';
import type { DailyReport } from './report.js';

function baseReport(overrides: Partial<DailyReport> = {}): DailyReport {
  return {
    date: '2026-08-16',
    completedVisits: 12,
    clients: 12,
    revenue: { total: 28400, services: 26900, products: 1500 },
    averageCheck: 2367,
    futureBookings: {
      createdToday: 7,
      createdTodayAmount: 17400,
      totalOutstanding: 8,
      totalOutstandingAmount: 19200,
    },
    cancellations: 1,
    noShows: 0,
    calls: null,
    staff: [
      { staffId: 101, displayName: 'Арташ', clients: 5, revenue: 12300, averageCheck: 2460 },
      { staffId: 102, displayName: 'Ксения', clients: 6, revenue: 15100, averageCheck: 2517 },
    ],
    ...overrides,
  };
}

describe('money/num formatting', () => {
  it('formats rubles with grouping', () => {
    expect(money(28400)).toBe('28 400 ₽');
    expect(num(12000)).toBe('12 000');
  });
  it('returns null for null (hidden, not zero)', () => {
    expect(money(null)).toBeNull();
    expect(num(null)).toBeNull();
  });
});

describe('formatDailyReport (spec §16, §23, §38)', () => {
  it('renders the main blocks for a normal day', () => {
    const text = formatDailyReport(baseReport());
    expect(text).toContain('РУБЛЪ · 16 АВГУСТА');
    expect(text).toContain('ДЕНЬ');
    expect(text).toContain('12 клиентов');
    expect(text).toContain('УСЛУГИ');
    expect(text).toContain('ТОВАРЫ');
    expect(text).toContain('БУДУЩИЕ ЗАПИСИ');
    expect(text).toContain('МАСТЕРА');
    expect(text).toContain('Арташ');
    expect(text).toContain('ОТМЕНЫ');
    expect(text).toContain('НЕЯВКИ');
  });

  it('shows a zero (0) metric that is genuinely zero', () => {
    const text = formatDailyReport(baseReport({ noShows: 0, cancellations: 0 }));
    expect(text).toContain('ОТМЕНЫ');
    expect(text).toMatch(/НЕЯВКИ<\/b>\s+0/);
  });

  it('HIDES null metrics instead of showing 0 (products = null)', () => {
    const text = formatDailyReport(
      baseReport({ revenue: { total: 26900, services: 26900, products: null } }),
    );
    expect(text).not.toContain('ТОВАРЫ');
    expect(text).toContain('УСЛУГИ');
  });

  it('day with no records: revenue null → no revenue lines, no bogus zero', () => {
    const text = formatDailyReport(
      baseReport({
        completedVisits: 0,
        clients: 0,
        revenue: { total: null, services: null, products: null },
        averageCheck: null,
        staff: [],
      }),
    );
    expect(text).not.toContain('выручка');
    expect(text).not.toContain('средний чек');
    expect(text).not.toContain('МАСТЕРА');
  });

  it('omits calls block when no telephony source is connected', () => {
    const text = formatDailyReport(baseReport({ calls: null }));
    expect(text).not.toContain('ЗВОНКИ');
  });

  it('includes calls block when a source provides data', () => {
    const text = formatDailyReport(
      baseReport({ calls: { incoming: 10, answered: 8, missed: 2, unique: 9, conversion: 0.4 } }),
    );
    expect(text).toContain('ЗВОНКИ');
    expect(text).toContain('конверсия 40%');
  });
});
