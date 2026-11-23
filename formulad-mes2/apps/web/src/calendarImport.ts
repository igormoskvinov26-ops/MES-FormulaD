import type { CalendarDayChange } from './api';

export type CalendarImportResult = {
  rows: CalendarDayChange[];
  errors: { line: number; message: string }[];
  duplicates: number;
  format: 'table' | 'months';
};

const MONTH_STEMS = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
const monthIndex = (cell: string) => {
  const c = cell.trim().toLowerCase();
  return MONTH_STEMS.findIndex((stem, i) => (i === 4 ? c === 'май' || c === 'мая' : c.startsWith(stem)));
};
const daysIn = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const pad = (n: number) => String(n).padStart(2, '0');

export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (match) [y, m, d] = [+match[1], +match[2], +match[3]];
  else if ((match = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s))) [d, m, y] = [+match[1], +match[2], +match[3]];
  else return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d || y < 2000 || y > 2100) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function parseTime(raw: string): string | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw.trim());
  if (!match) return null;
  const h = +match[1], min = +match[2];
  return h > 23 || min > 59 ? null : `${pad(h)}:${pad(min)}`;
}

const minutes = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);

function splitLine(line: string): string[] {
  const delimiter = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
  return line.split(delimiter).map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim());
}

const isMonthHeader = (line: string) => line.split(/[\t;]/).filter((c) => monthIndex(c) >= 0).length >= 6;

function parseMonthMatrix(lines: string[], defaults: { shiftStart: string; shiftEnd: string }): CalendarImportResult {
  const errors: CalendarImportResult['errors'] = [];
  const byDate = new Map<string, CalendarDayChange>();
  let duplicates = 0;
  let columns: number[] = [];
  const shortEnd = (() => { const m = minutes(defaults.shiftEnd) - 60; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; })();

  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const cells = line.split(/[\t;]/).map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim());
    if (isMonthHeader(line)) { columns = cells.map(monthIndex); return; }
    const year = /^\d{4}$/.test(cells[0]) ? +cells[0] : null;
    if (year === null || year < 2000 || year > 2100 || columns.length === 0) return;
    cells.forEach((cell, col) => {
      const month = columns[col] ?? -1;
      if (month < 0 || !cell) return;
      for (const token of cell.split(/[,\s]+/).filter(Boolean)) {
        const m = /^(\d{1,2})([*+])?$/.exec(token);
        const day = m ? +m[1] : 0;
        if (!m || day < 1 || day > daysIn(year, month)) { errors.push({ line: i + 1, message: `Непонятная отметка «${token}»` }); return; }
        const date = `${year}-${pad(month + 1)}-${pad(day)}`;
        const change: CalendarDayChange = m[2] === '*'
          ? { date, kind: 'work', from: defaults.shiftStart, to: shortEnd, note: 'Сокращённый день' }
          : m[2] === '+'
            ? { date, kind: 'work', from: null, to: null, note: 'Рабочий день (перенос)' }
            : { date, kind: 'off', from: null, to: null, note: null };
        if (byDate.has(date)) duplicates++;
        byDate.set(date, change);
      }
    });
  });
  return { rows: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), errors, duplicates, format: 'months' };
}

export function parseCalendarImport(text: string, defaults: { shiftStart: string; shiftEnd: string }): CalendarImportResult {
  const all = text.split(/\r?\n/);
  if (all.some(isMonthHeader)) return parseMonthMatrix(all, defaults);
  const errors: CalendarImportResult['errors'] = [];
  const byDate = new Map<string, CalendarDayChange>();
  let duplicates = 0;
  let first = true;

  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const cells = splitLine(line);
    const lineNo = i + 1;
    const date = parseDate(cells[0] ?? '');
    if (date === null) {
      if (first) { first = false; return; }
      errors.push({ line: lineNo, message: `Не дата: «${cells[0] ?? ''}»` });
      return;
    }
    first = false;
    const typeText = (cells[1] ?? '').toLowerCase();
    let kind: 'off' | 'work';
    let shortened = false;
    if (typeText === '' || /^(вых|пра|нераб)/.test(typeText)) kind = 'off';
    else if (/^(раб|пере)/.test(typeText)) kind = 'work';
    else if (/^сокр/.test(typeText)) { kind = 'work'; shortened = true; }
    else { errors.push({ line: lineNo, message: `Неизвестный тип «${cells[1]}»` }); return; }

    let from: string | null = null;
    let to: string | null = null;
    if (kind === 'work' && (cells[2] || cells[3])) {
      from = parseTime(cells[2] ?? '');
      to = parseTime(cells[3] ?? '');
      if (from === null || to === null) { errors.push({ line: lineNo, message: 'Часы работы — оба в формате ЧЧ:ММ' }); return; }
      if (minutes(from) >= minutes(to)) { errors.push({ line: lineNo, message: 'Начало рабочего дня должно быть раньше конца' }); return; }
    } else if (shortened) {
      from = defaults.shiftStart;
      const end = minutes(defaults.shiftEnd) - 60;
      to = `${pad(Math.floor(end / 60))}:${pad(end % 60)}`;
    } else if (kind === 'off' && (cells[2] || cells[3])) {
      errors.push({ line: lineNo, message: 'У выходного дня часы не задаются' }); return;
    }

    const note = cells[4] || (kind === 'off' && /^пра/.test(typeText) ? 'Праздник' : shortened ? 'Сокращённый день' : '') || null;
    if (byDate.has(date)) duplicates++;
    byDate.set(date, { date, kind, from, to, note });
  });

  return { rows: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), errors, duplicates, format: 'table' };
}
