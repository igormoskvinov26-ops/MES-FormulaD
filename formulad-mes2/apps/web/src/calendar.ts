import type { CalendarDay, CalendarSettings, ProductionPlanItem } from './api';

export type DayOverride = { kind: 'off' | 'work'; from: string | null; to: string | null; note: string | null };

export type CalendarConfig = CalendarSettings & { overrides: Record<string, DayOverride> };

export const DEFAULT_CONFIG: CalendarConfig = {
  workdays: [1, 2, 3, 4, 5],
  shiftStart: '08:00',
  shiftEnd: '17:00',
  breaks: [{ from: '12:00', to: '13:00' }],
  perShift: 8,
  controlPosts: [],
  overrides: {},
};

export function configFrom(settings: CalendarSettings, days: CalendarDay[]): CalendarConfig {
  return { ...settings, overrides: Object.fromEntries(days.map((d) => [d.date, { kind: d.kind, from: d.from, to: d.to, note: d.note }])) };
}

export type Slot = {
  item: ProductionPlanItem;
  date: string;
  index: number;
  time: string;
  pinned: boolean;
  deltaDays: number | null;
  done?: boolean;
};

const pad = (n: number) => String(n).padStart(2, '0');
export const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (s: string, n: number) => {
  const d = parseYmd(s);
  return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};
export const isoWeekday = (s: string) => parseYmd(s).getDay() || 7;
export const mondayOf = (s: string) => addDays(s, 1 - isoWeekday(s));
export const diffDays = (a: string, b: string) => {
  const x = parseYmd(a);
  const y = parseYmd(b);
  return Math.round((Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) - Date.UTC(y.getFullYear(), y.getMonth(), y.getDate())) / 86400000);
};

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const clock = (min: number) => `${pad(Math.floor(min / 60))}:${pad(Math.round(min % 60))}`;

function segments(from: string, to: string, breaks: CalendarConfig['breaks']): [number, number][] {
  const out: [number, number][] = [];
  let start = minutes(from);
  const end = minutes(to);
  for (const b of [...breaks].sort((x, y) => minutes(x.from) - minutes(y.from))) {
    const bf = Math.max(minutes(b.from), start);
    const bt = Math.min(minutes(b.to), end);
    if (bt <= bf) continue;
    if (bf > start) out.push([start, bf]);
    start = bt;
  }
  if (end > start) out.push([start, end]);
  return out;
}
const total = (segs: [number, number][]) => segs.reduce((s, [a, b]) => s + (b - a), 0);

export type DayInfo = {
  date: string;
  working: boolean;
  from: string;
  to: string;
  capacity: number;
  slotMinutes: number;
  segs: [number, number][];
  override: DayOverride | null;
  natural: boolean;
};

export function dayInfo(date: string, cfg: CalendarConfig = DEFAULT_CONFIG): DayInfo {
  const override = cfg.overrides[date] ?? null;
  const natural = cfg.workdays.includes(isoWeekday(date));
  const working = override ? override.kind === 'work' : natural;
  const from = (override?.kind === 'work' && override.from) || cfg.shiftStart;
  const to = (override?.kind === 'work' && override.to) || cfg.shiftEnd;
  const slotMinutes = total(segments(cfg.shiftStart, cfg.shiftEnd, cfg.breaks)) / cfg.perShift;
  const segs = working ? segments(from, to, cfg.breaks) : [];
  const capacity = working ? Math.floor(total(segs) / slotMinutes + 1e-9) : 0;
  return { date, working, from, to, capacity, slotMinutes, segs, override, natural };
}

export const isWorkday = (date: string, cfg: CalendarConfig = DEFAULT_CONFIG) => dayInfo(date, cfg).working;

export function slotStartMinutes(index: number, info: DayInfo) {
  let offset = index * info.slotMinutes;
  for (const [a, b] of info.segs) {
    if (offset < b - a) return a + offset;
    offset -= b - a;
  }
  return info.segs.length ? info.segs[info.segs.length - 1][1] : 0;
}

export const slotTime = (index: number, cfg: CalendarConfig = DEFAULT_CONFIG) =>
  clock(slotStartMinutes(index, { ...dayInfo('2026-11-09', { ...cfg, workdays: [1], overrides: {} }) }));

const nextSchedulable = (date: string, cfg: CalendarConfig) => {
  let d = date;
  for (let i = 0; i < 370 && dayInfo(d, cfg).capacity === 0; i++) d = addDays(d, 1);
  return d;
};

const PINNED = new Set([1, 2, 4]);

export function scheduleItems(items: ProductionPlanItem[], now: Date, cfg: CalendarConfig = DEFAULT_CONFIG): Slot[] {
  const queue = items.filter((i) => i.statusId !== 3);
  const ordered = [...queue.filter((i) => PINNED.has(i.statusId ?? -1)), ...queue.filter((i) => !PINNED.has(i.statusId ?? -1))];

  let date = ymd(now);
  let info = dayInfo(date, cfg);
  let index = 0;
  if (info.capacity > 0) {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    while (index < info.capacity && slotStartMinutes(index, info) < nowMin) index++;
  }
  if (info.capacity === 0 || index >= info.capacity) {
    date = nextSchedulable(addDays(date, 1), cfg);
    info = dayInfo(date, cfg);
    index = 0;
  }

  const slots: Slot[] = [];
  for (const item of ordered) {
    const planned = item.plannedCompleteDate?.slice(0, 10) ?? null;
    slots.push({
      item,
      date,
      index,
      time: clock(slotStartMinutes(index, info)),
      pinned: PINNED.has(item.statusId ?? -1),
      deltaDays: planned ? diffDays(date, planned) : null,
    });
    index++;
    if (index >= info.capacity) {
      date = nextSchedulable(addDays(date, 1), cfg);
      info = dayInfo(date, cfg);
      index = 0;
    }
  }
  return slots;
}

export type DayColumn = DayInfo & { slots: Slot[] };

export function weekColumns(anchor: string, slots: Slot[], cfg: CalendarConfig = DEFAULT_CONFIG): DayColumn[] {
  const monday = mondayOf(anchor);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { ...dayInfo(date, cfg), slots: slots.filter((s) => s.date === date) };
  });
}

export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function addMonths(date: string, n: number) {
  const d = parseYmd(date);
  return ymd(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

export function monthGrid(anchor: string): string[] {
  const d = parseYmd(anchor);
  const first = ymd(new Date(d.getFullYear(), d.getMonth(), 1));
  const last = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  const start = mondayOf(first);
  const end = addDays(mondayOf(last), 6);
  const out: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) out.push(day);
  return out;
}

export const timeToMinutes = minutes;

export type HourRow = { hour: number; label: string; isBreak: boolean; slots: Slot[] };

export function dayHourRows(info: DayInfo, slots: Slot[], cfg: CalendarConfig = DEFAULT_CONFIG): HourRow[] {
  if (!info.working || info.segs.length === 0) return [];
  const first = Math.floor(minutes(info.from) / 60);
  const last = Math.ceil(minutes(info.to) / 60) - 1;
  const breaks = cfg.breaks.map((b) => [minutes(b.from), minutes(b.to)] as const);
  return Array.from({ length: last - first + 1 }, (_, i) => {
    const hour = first + i;
    return {
      hour,
      label: `${pad(hour)}:00`,
      isBreak: breaks.some(([a, b]) => a <= hour * 60 && b >= hour * 60 + 60),
      slots: slots.filter((s) => Math.floor(minutes(s.time) / 60) === hour),
    };
  });
}

const timeOf = (stamp: string) => {
  const t = stamp.slice(11, 16);
  return /^\d\d:\d\d$/.test(t) && t !== '00:00' ? t : '—';
};

export function releasedSlots(items: ProductionPlanItem[]): Slot[] {
  return items
    .filter((i) => i.statusId === 3 && i.fokDate)
    .map((item) => {
      const date = item.fokDate!.slice(0, 10);
      const planned = item.plannedCompleteDate?.slice(0, 10) ?? null;
      return { item, date, index: 0, time: timeOf(item.fokDate!), pinned: true, done: true, deltaDays: planned ? diffDays(date, planned) : null };
    })
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
