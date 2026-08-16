import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Daily report assembly — spec §45 (Report) edge cases, with YCLIENTS mocked.
 */
const yclients = {
  getDailyFigures: vi.fn(),
  getFutureBookings: vi.fn(),
};

async function load() {
  vi.resetModules();
  vi.doMock('../yclients/index.js', () => yclients);
  return import('./report.js');
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.doUnmock('../yclients/index.js'));

function figures(over: Record<string, unknown> = {}) {
  return {
    completedVisits: 12,
    clients: 12,
    revenueTotal: 28400,
    revenueServices: 26900,
    revenueProducts: 1500,
    paidVisits: 12,
    cancellations: 1,
    noShows: 0,
    perStaff: [{ staffId: 101, displayName: 'Арташ', clients: 12, revenue: 28400, averageCheck: 2367 }],
    ...over,
  };
}
function future(over: Record<string, unknown> = {}) {
  return { createdToday: 7, createdTodayAmount: 17400, totalOutstanding: 8, totalOutstandingAmount: 19200, ...over };
}

describe('buildDailyReport', () => {
  it('normal working day → assembled with computed average check and null calls', async () => {
    const { buildDailyReport } = await load();
    yclients.getDailyFigures.mockResolvedValue(figures());
    yclients.getFutureBookings.mockResolvedValue(future());
    const r = await buildDailyReport('2026-08-16');
    expect(r.completedVisits).toBe(12);
    expect(r.revenue.total).toBe(28400);
    expect(r.averageCheck).toBe(Math.round(28400 / 12));
    expect(r.calls).toBeNull(); // no telephony source connected
    expect(r.futureBookings.totalOutstanding).toBe(8);
  });

  it('day without records → zeros/nulls, average check null (not bogus)', async () => {
    const { buildDailyReport } = await load();
    yclients.getDailyFigures.mockResolvedValue(
      figures({
        completedVisits: 0,
        clients: 0,
        revenueTotal: null,
        revenueServices: null,
        revenueProducts: null,
        paidVisits: null,
        perStaff: [],
      }),
    );
    yclients.getFutureBookings.mockResolvedValue(
      future({ createdToday: 0, createdTodayAmount: 0, totalOutstanding: 0, totalOutstandingAmount: 0 }),
    );
    const r = await buildDailyReport('2026-08-16');
    expect(r.revenue.total).toBeNull();
    expect(r.averageCheck).toBeNull();
    expect(r.staff).toEqual([]);
  });

  it('product sales absent (null) stays null, not zero', async () => {
    const { buildDailyReport } = await load();
    yclients.getDailyFigures.mockResolvedValue(figures({ revenueProducts: null }));
    yclients.getFutureBookings.mockResolvedValue(future());
    const r = await buildDailyReport('2026-08-16');
    expect(r.revenue.products).toBeNull();
  });

  it('no future bookings source → null metrics preserved', async () => {
    const { buildDailyReport } = await load();
    yclients.getDailyFigures.mockResolvedValue(figures());
    yclients.getFutureBookings.mockResolvedValue(
      future({ createdToday: null, createdTodayAmount: null, totalOutstanding: null, totalOutstandingAmount: null }),
    );
    const r = await buildDailyReport('2026-08-16');
    expect(r.futureBookings.createdToday).toBeNull();
    expect(r.futureBookings.totalOutstanding).toBeNull();
  });

  it('YCLIENTS temporarily unavailable → error propagates', async () => {
    const { buildDailyReport } = await load();
    yclients.getDailyFigures.mockRejectedValue(new Error('Daily report source incomplete'));
    yclients.getFutureBookings.mockResolvedValue(future());
    await expect(buildDailyReport('2026-08-16')).rejects.toThrow('Daily report source incomplete');
  });
});
