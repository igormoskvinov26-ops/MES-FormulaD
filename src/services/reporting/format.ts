import { reportDateLabel } from '../../lib/time.js';
import { barberByStaffId } from '../../config/barbers.js';
import type { DailyReport } from './report.js';

/**
 * Compact, phone-friendly Telegram report (spec §23). Business, laconic, HTML
 * bold, minimal emoji. Metrics that are null are hidden — never rendered as 0.
 */

const NBSP = ' ';

/** Format an integer amount as "28 400 ₽" (thin-ish grouping with NBSP). */
export function money(n: number | null): string | null {
  if (n == null) return null;
  const rounded = Math.round(n);
  const grouped = rounded.toLocaleString('ru-RU').replace(/\s/g, NBSP);
  return `${grouped}${NBSP}₽`;
}

export function num(n: number | null): string | null {
  if (n == null) return null;
  return n.toLocaleString('ru-RU').replace(/\s/g, NBSP);
}

function line(parts: Array<string | null | undefined>): string | null {
  const kept = parts.filter((p): p is string => Boolean(p));
  return kept.length ? kept.join(' · ') : null;
}

function pluralClients(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'клиент';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'клиента';
  return 'клиентов';
}

function b(s: string): string {
  return `<b>${s}</b>`;
}

/**
 * Render the report to a Telegram HTML string. Only sections with real data
 * appear.
 */
export function formatDailyReport(report: DailyReport): string {
  const out: string[] = [];
  out.push(b(`РУБЛЪ · ${reportDateLabel(report.date)}`));

  // DAY block
  const dayLines: string[] = [];
  if (report.completedVisits != null) {
    dayLines.push(`${report.completedVisits} ${pluralClients(report.completedVisits)}`);
  } else if (report.clients != null) {
    dayLines.push(`${report.clients} ${pluralClients(report.clients)}`);
  }
  const rev = money(report.revenue.total);
  if (rev) dayLines.push(`${rev} выручка`);
  const avg = money(report.averageCheck);
  if (avg) dayLines.push(`${avg} средний чек`);
  if (dayLines.length) {
    out.push('');
    out.push(b('ДЕНЬ'));
    out.push(dayLines.join('\n'));
  }

  // Revenue split
  const svc = money(report.revenue.services);
  const prod = money(report.revenue.products);
  if (svc || prod) {
    out.push('');
    if (svc) out.push(`${b('УСЛУГИ')}  ${svc}`);
    if (prod) out.push(`${b('ТОВАРЫ')}  ${prod}`);
  }

  // Future bookings
  const fb = report.futureBookings;
  const futureLines: string[] = [];
  if (fb.createdToday != null) {
    const amt = money(fb.createdTodayAmount);
    futureLines.push(`Новых сегодня: ${fb.createdToday}${amt ? ` · ${amt}` : ''}`);
  }
  if (fb.totalOutstanding != null) {
    const amt = money(fb.totalOutstandingAmount);
    futureLines.push(`Всего будущих: ${fb.totalOutstanding}${amt ? ` · ${amt}` : ''}`);
  }
  if (futureLines.length) {
    out.push('');
    out.push(b('БУДУЩИЕ ЗАПИСИ'));
    out.push(futureLines.join('\n'));
  }

  // Per-staff
  const staff = report.staff.filter((s) => (s.clients ?? 0) > 0 || (s.revenue ?? 0) > 0);
  if (staff.length) {
    out.push('');
    out.push(b('МАСТЕРА'));
    for (const s of staff) {
      const cfg = barberByStaffId(s.staffId);
      const name = cfg?.displayName || s.displayName || `#${s.staffId}`;
      const parts = line([
        s.clients != null ? `${s.clients} ${pluralClients(s.clients)}` : null,
        money(s.revenue),
        s.averageCheck != null ? `ср. чек ${money(s.averageCheck)}` : null,
      ]);
      out.push(`${name} — ${parts ?? 'нет данных'}`);
    }
  }

  // Cancellations / no-shows
  if (report.cancellations != null) {
    out.push('');
    out.push(`${b('ОТМЕНЫ')}  ${report.cancellations}`);
  }
  if (report.noShows != null) {
    out.push(`${b('НЕЯВКИ')}  ${report.noShows}`);
  }

  // Calls (only when a source is connected)
  if (report.calls) {
    const c = report.calls;
    const callLines = line([
      c.incoming != null ? `входящие ${c.incoming}` : null,
      c.answered != null ? `отвечено ${c.answered}` : null,
      c.missed != null ? `пропущено ${c.missed}` : null,
      c.conversion != null ? `конверсия ${Math.round(c.conversion * 100)}%` : null,
    ]);
    if (callLines) {
      out.push('');
      out.push(b('ЗВОНКИ'));
      out.push(callLines);
    }
  }

  return out.join('\n');
}
