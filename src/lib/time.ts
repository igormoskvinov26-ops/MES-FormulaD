import { DateTime } from 'luxon';
import { BUSINESS_TZ } from '../config/env.js';

/**
 * All business time is computed in Europe/Moscow (BUSINESS_TZ), never from the
 * server's system clock/timezone. The server may physically run elsewhere.
 */

/** Current moment in the business timezone. */
export function nowMsk(): DateTime {
  return DateTime.now().setZone(BUSINESS_TZ);
}

/** Today's date (business tz) as YYYY-MM-DD. */
export function todayMsk(): string {
  return nowMsk().toFormat('yyyy-MM-dd');
}

/** Parse a YYYY-MM-DD business date into a DateTime at start of day (msk). */
export function parseBusinessDate(date: string): DateTime {
  return DateTime.fromFormat(date, 'yyyy-MM-dd', { zone: BUSINESS_TZ }).startOf('day');
}

/** True if the given YYYY-MM-DD equals today in the business tz. */
export function isToday(date: string): boolean {
  return date === todayMsk();
}

/** Validate a YYYY-MM-DD string. */
export function isValidBusinessDate(date: string): boolean {
  const dt = DateTime.fromFormat(date, 'yyyy-MM-dd', { zone: BUSINESS_TZ });
  return dt.isValid;
}

/**
 * Combine a business date (YYYY-MM-DD) and a wall time (HH:mm) into an absolute
 * DateTime in the business tz.
 */
export function businessDateTime(date: string, hhmm: string): DateTime {
  return DateTime.fromFormat(`${date} ${hhmm}`, 'yyyy-MM-dd HH:mm', {
    zone: BUSINESS_TZ,
  });
}

/**
 * True if a slot time (HH:mm) on the given date is in the past relative to now
 * (business tz). Used to drop already-passed slots.
 */
export function isSlotInPast(date: string, hhmm: string, reference: DateTime = nowMsk()): boolean {
  const slot = businessDateTime(date, hhmm);
  if (!slot.isValid) return true; // unparseable → treat as unusable
  return slot <= reference;
}

/** Format a DateTime for logs/reports as a readable msk timestamp. */
export function formatMsk(dt: DateTime = nowMsk()): string {
  return dt.setZone(BUSINESS_TZ).toFormat('yyyy-MM-dd HH:mm:ss ZZZZ');
}

/** Human day+month label for reports, e.g. "16 АВГУСТА". */
export function reportDateLabel(date: string): string {
  const dt = parseBusinessDate(date);
  const months = [
    'ЯНВАРЯ',
    'ФЕВРАЛЯ',
    'МАРТА',
    'АПРЕЛЯ',
    'МАЯ',
    'ИЮНЯ',
    'ИЮЛЯ',
    'АВГУСТА',
    'СЕНТЯБРЯ',
    'ОКТЯБРЯ',
    'НОЯБРЯ',
    'ДЕКАБРЯ',
  ];
  const month = months[dt.month - 1] ?? '';
  return `${dt.day} ${month}`.trim();
}

/** Parse "HH:mm" into {hour, minute}. */
export function parseHHmm(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(':').map((x) => Number.parseInt(x, 10));
  return { hour: h ?? 0, minute: m ?? 0 };
}
