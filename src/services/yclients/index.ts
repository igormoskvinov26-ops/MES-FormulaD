import { DateTime } from 'luxon';
import { BUSINESS_TZ } from '../../config/env.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { isSlotInPast, nowMsk } from '../../lib/time.js';
import { yclientsClient } from './client.js';
import type {
  DailyFigures,
  FreeSlot,
  FutureBookings,
  StaffDailyResult,
  StaffScheduleEntry,
  YclientsRecord,
} from './types.js';

/**
 * High-level YCLIENTS operations used by Stories and reporting.
 *
 * IMPORTANT null semantics: where the API does not reliably provide a metric,
 * these methods return `null` for that metric. Callers must NOT coerce null to
 * zero — "no data" and "zero" are different (spec §16, §38).
 */

const client = () => yclientsClient();

function hhmm(datetime: string): string {
  // Accept "YYYY-MM-DD HH:mm:ss" or ISO; format in business tz.
  const dt =
    DateTime.fromFormat(datetime, 'yyyy-MM-dd HH:mm:ss', { zone: BUSINESS_TZ }).isValid
      ? DateTime.fromFormat(datetime, 'yyyy-MM-dd HH:mm:ss', { zone: BUSINESS_TZ })
      : DateTime.fromISO(datetime, { zone: BUSINESS_TZ });
  return dt.isValid ? dt.toFormat('HH:mm') : datetime;
}

/**
 * Source of truth for "who works today" — the staff work schedule, NOT the
 * mere ability to book online (spec §3).
 *
 * Uses GET /company/{id}/staff/schedule with a single-day window.
 */
export async function getStaffSchedule(date: string): Promise<StaffScheduleEntry[]> {
  const c = client();
  let raw: unknown;
  try {
    raw = await c.get(`/company/${c.companyId}/staff/schedule`, {
      start_date: date,
      end_date: date,
    });
  } catch (err) {
    logger.error('failed to load staff schedule', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw Errors.yclientsScheduleUnavailable();
  }

  // Response shape (v2): array of { staff_id, date, slots:[{from,to}], busy_intervals... }
  const rows = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
  const entries: StaffScheduleEntry[] = [];
  for (const row of rows) {
    const staffId = Number(row.staff_id ?? row.staffId);
    if (!Number.isFinite(staffId) || staffId <= 0) continue;
    const slots = Array.isArray(row.slots) ? (row.slots as Array<Record<string, unknown>>) : [];
    const worksToday = slots.length > 0;
    const first = slots[0];
    const last = slots[slots.length - 1];
    entries.push({
      staffId,
      displayName: String((row.staff as { name?: string } | undefined)?.name ?? row.name ?? ''),
      worksToday,
      shiftStart: first ? String(first.from ?? '').slice(0, 5) || null : null,
      shiftEnd: last ? String(last.to ?? '').slice(0, 5) || null : null,
    });
  }
  return entries;
}

/** Staff with a shift today, per the work schedule. */
export async function getWorkingStaff(date: string): Promise<StaffScheduleEntry[]> {
  const schedule = await getStaffSchedule(date);
  return schedule.filter((s) => s.worksToday);
}

/**
 * Real bookable free windows for a staff member on a date.
 * Uses the booking chain: GET /book_times/{companyId}/{staffId}/{date}.
 *
 * Filters out (spec §5):
 *  - times already in the past (business tz)
 *  - non-bookable / blocked intervals
 * (Busy/occupied and after-shift intervals are already excluded by
 *  book_times, which only returns genuinely bookable times.)
 */
export async function getAvailableSlots(
  staffId: number,
  date: string,
  shiftEnd?: string | null,
): Promise<FreeSlot[]> {
  const c = client();
  let raw: unknown;
  try {
    raw = await c.get(`/book_times/${c.companyId}/${staffId}/${date}`);
  } catch (err) {
    logger.warn('failed to load book_times', {
      staffId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }

  const rows = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
  const ref = nowMsk();
  const slots: FreeSlot[] = [];
  for (const row of rows) {
    const time = String(row.time ?? '').slice(0, 5);
    if (!time) continue;
    const bookable = row.is_bookable === undefined ? true : Boolean(row.is_bookable);
    if (!bookable) continue;
    if (isSlotInPast(date, time, ref)) continue;
    if (shiftEnd && time > shiftEnd) continue; // after shift end
    slots.push({ time, datetime: String(row.datetime ?? ''), bookable });
  }
  // dedupe + sort ascending by time
  const seen = new Set<string>();
  return slots
    .filter((s) => (seen.has(s.time) ? false : (seen.add(s.time), true)))
    .sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * Fetch raw records for a date window. `start`/`end` are YYYY-MM-DD.
 * Returns [] on failure (callers decide whether that's fatal).
 */
async function getRecords(start: string, end: string): Promise<YclientsRecord[]> {
  const c = client();
  const raw = await c.get<YclientsRecord[]>(`/records/${c.companyId}`, {
    start_date: start,
    end_date: end,
    count: 1000,
  });
  return Array.isArray(raw) ? raw : [];
}

function recordServiceRevenue(r: YclientsRecord): number {
  if (!Array.isArray(r.services)) return 0;
  return r.services.reduce((sum, s) => sum + (Number(s.cost ?? s.first_cost ?? 0) || 0), 0);
}

function recordProductRevenue(r: YclientsRecord): number | null {
  if (!Array.isArray(r.goods_transactions)) return null; // field absent → unknown
  return r.goods_transactions.reduce((sum, g) => sum + (Number(g.cost ?? 0) || 0), 0);
}

/**
 * Aggregate today's completed visits, revenue split, cancellations and
 * no-shows from records. Fields the source cannot supply stay `null`.
 */
export async function getDailyFigures(date: string): Promise<DailyFigures> {
  let records: YclientsRecord[];
  try {
    records = await getRecords(date, date);
  } catch (err) {
    logger.error('failed to load daily records', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw Errors.dailyReportSourceIncomplete();
  }

  const live = records.filter((r) => !r.deleted);
  // attendance: 1 = arrived (completed), -1 = no-show, 2 = confirmed, 0 = waiting
  const completed = live.filter((r) => r.attendance === 1);
  const noShow = live.filter((r) => r.attendance === -1);
  const cancelled = records.filter((r) => r.deleted === true);

  const clients = new Set<number>();
  for (const r of completed) if (r.client?.id) clients.add(r.client.id);

  let revenueServices = 0;
  let paidVisits = 0;
  let productKnown = false;
  let revenueProducts = 0;
  for (const r of completed) {
    revenueServices += recordServiceRevenue(r);
    if (r.paid_full === 1) paidVisits += 1;
    const prod = recordProductRevenue(r);
    if (prod !== null) {
      productKnown = true;
      revenueProducts += prod;
    }
  }

  const perStaff = aggregatePerStaff(completed);

  const revenueProductsFinal = productKnown ? revenueProducts : null;
  const revenueTotal =
    revenueServices + (revenueProductsFinal ?? 0);

  return {
    completedVisits: completed.length,
    clients: clients.size,
    revenueTotal: completed.length > 0 || productKnown ? revenueTotal : null,
    revenueServices: completed.length > 0 ? revenueServices : null,
    revenueProducts: revenueProductsFinal,
    paidVisits: completed.length > 0 ? paidVisits : null,
    cancellations: cancelled.length,
    noShows: noShow.length,
    perStaff,
  };
}

function aggregatePerStaff(completed: YclientsRecord[]): StaffDailyResult[] {
  const byStaff = new Map<number, { name: string; clients: Set<number>; revenue: number; visits: number }>();
  for (const r of completed) {
    const id = r.staff_id ?? r.staff?.id ?? 0;
    if (!id) continue;
    const entry =
      byStaff.get(id) ?? { name: r.staff?.name ?? '', clients: new Set<number>(), revenue: 0, visits: 0 };
    if (r.client?.id) entry.clients.add(r.client.id);
    entry.revenue += recordServiceRevenue(r);
    entry.visits += 1;
    byStaff.set(id, entry);
  }
  const out: StaffDailyResult[] = [];
  for (const [staffId, v] of byStaff) {
    const clients = v.clients.size;
    out.push({
      staffId,
      displayName: v.name,
      clients: clients || v.visits,
      revenue: v.revenue,
      averageCheck: v.visits > 0 ? Math.round(v.revenue / v.visits) : null,
    });
  }
  return out.sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));
}

/**
 * Future bookings — two distinct metrics (spec §20):
 *  - createdToday: new future bookings created today
 *  - totalOutstanding: all current future bookings
 * A metric that cannot be determined stays null.
 */
export async function getFutureBookings(date: string, horizonDays = 60): Promise<FutureBookings> {
  const start = date;
  const end = DateTime.fromFormat(date, 'yyyy-MM-dd', { zone: BUSINESS_TZ })
    .plus({ days: horizonDays })
    .toFormat('yyyy-MM-dd');

  let records: YclientsRecord[];
  try {
    records = await getRecords(start, end);
  } catch {
    return {
      createdToday: null,
      createdTodayAmount: null,
      totalOutstanding: null,
      totalOutstandingAmount: null,
    };
  }

  const ref = nowMsk();
  const future = records.filter((r) => {
    if (r.deleted) return false;
    const dt = DateTime.fromFormat(r.date, 'yyyy-MM-dd HH:mm:ss', { zone: BUSINESS_TZ });
    return dt.isValid && dt > ref;
  });

  const totalOutstanding = future.length;
  const totalOutstandingAmount = future.reduce((s, r) => s + recordServiceRevenue(r), 0);

  // "created today" requires a create_date field; if absent, leave null.
  const hasCreateDate = records.some((r) => Boolean(r.create_date));
  let createdToday: number | null = null;
  let createdTodayAmount: number | null = null;
  if (hasCreateDate) {
    const createdList = future.filter((r) => (r.create_date ?? '').slice(0, 10) === date);
    createdToday = createdList.length;
    createdTodayAmount = createdList.reduce((s, r) => s + recordServiceRevenue(r), 0);
  }

  return {
    createdToday,
    createdTodayAmount,
    totalOutstanding,
    totalOutstandingAmount,
  };
}

/** Convenience wrappers matching the spec's adapter method names. */
export async function getDailyVisits(date: string) {
  const f = await getDailyFigures(date);
  return { completedVisits: f.completedVisits, clients: f.clients };
}

export async function getDailyRevenue(date: string) {
  const f = await getDailyFigures(date);
  return { total: f.revenueTotal, services: f.revenueServices, products: f.revenueProducts };
}

export async function getProductSales(date: string) {
  const f = await getDailyFigures(date);
  return f.revenueProducts;
}

export { hhmm as formatSlotTime };
