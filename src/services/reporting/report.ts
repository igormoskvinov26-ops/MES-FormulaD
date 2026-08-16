import { parseBusinessDate } from '../../lib/time.js';
import { getDailyFigures, getFutureBookings } from '../yclients/index.js';
import type { StaffDailyResult } from '../yclients/types.js';
import { callStatsProvider, type CallStats } from './calls.js';

/**
 * The single management-report object (spec §38).
 *
 * `null` means "the source does not provide this metric" and MUST NOT be shown
 * as 0. The formatter hides null metrics (or shows "нет данных").
 */
export type DailyReport = {
  date: string;

  completedVisits: number | null;
  clients: number | null;

  revenue: {
    total: number | null;
    services: number | null;
    products: number | null;
  };

  averageCheck: number | null;

  futureBookings: {
    createdToday: number | null;
    createdTodayAmount: number | null;
    totalOutstanding: number | null;
    totalOutstandingAmount: number | null;
  };

  cancellations: number | null;
  noShows: number | null;

  calls: CallStats | null;

  staff: StaffDailyResult[];
};

/**
 * Average check: revenue / number of paid visits (spec §17). Falls back to
 * completed visits when paid-visit count is unavailable. Returns null if
 * neither denominator nor revenue is known — never a bogus average.
 */
export function computeAverageCheck(
  revenueTotal: number | null,
  paidVisits: number | null,
  completedVisits: number | null,
): number | null {
  if (revenueTotal == null) return null;
  const denom = paidVisits && paidVisits > 0 ? paidVisits : completedVisits ?? 0;
  if (denom <= 0) return null;
  return Math.round(revenueTotal / denom);
}

/** Build the full daily report from real sources; nothing is invented. */
export async function buildDailyReport(date: string): Promise<DailyReport> {
  const figures = await getDailyFigures(date);
  const future = await getFutureBookings(date);
  const calls = await callStatsProvider().getDailyStats(parseBusinessDate(date).toJSDate());

  const averageCheck = computeAverageCheck(
    figures.revenueTotal,
    figures.paidVisits,
    figures.completedVisits,
  );

  return {
    date,
    completedVisits: figures.completedVisits,
    clients: figures.clients,
    revenue: {
      total: figures.revenueTotal,
      services: figures.revenueServices,
      products: figures.revenueProducts,
    },
    averageCheck,
    futureBookings: {
      createdToday: future.createdToday,
      createdTodayAmount: future.createdTodayAmount,
      totalOutstanding: future.totalOutstanding,
      totalOutstandingAmount: future.totalOutstandingAmount,
    },
    cancellations: figures.cancellations,
    noShows: figures.noShows,
    calls,
    staff: figures.perStaff,
  };
}
