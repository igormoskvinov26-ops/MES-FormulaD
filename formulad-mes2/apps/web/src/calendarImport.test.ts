import { describe, expect, it } from 'vitest';
import { parseCalendarImport, parseDate } from './calendarImport';

const D = { shiftStart: '08:00', shiftEnd: '17:00' };

describe('parseDate', () => {
  it('принимает ДД.ММ.ГГГГ, ГГГГ-ММ-ДД, ДД/ММ/ГГГГ и отвергает несуществующие даты', () => {
    expect(parseDate('04.11.2026')).toBe('2026-11-04');
    expect(parseDate('4.1.2026')).toBe('2026-01-04');
    expect(parseDate('2026-11-04')).toBe('2026-11-04');
    expect(parseDate('04/11/2026')).toBe('2026-11-04');
    expect(parseDate('31.02.2026')).toBeNull();
    expect(parseDate('ноябрь')).toBeNull();
    expect(parseDate('01.01.1999')).toBeNull();
  });
});

describe('parseCalendarImport', () => {
  it('разбирает вставку из Excel (табуляция): выходные, праздники, перенос, сокращённый день, примечания', () => {
    const text = [
      'Дата\tТип\tС\tПо\tПримечание',
      '04.11.2026\tПраздник\t\t\tДень народного единства',
      '07.11.2026\tВыходной',
      '14.11.2026\tРабочий\t09:00\t15:00\tПеренос с 9 ноября',
      '31.12.2026\tСокращённый',
    ].join('\n');
    const r = parseCalendarImport(text, D);
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { date: '2026-11-04', kind: 'off', from: null, to: null, note: 'День народного единства' },
      { date: '2026-11-07', kind: 'off', from: null, to: null, note: null },
      { date: '2026-11-14', kind: 'work', from: '09:00', to: '15:00', note: 'Перенос с 9 ноября' },
      { date: '2026-12-31', kind: 'work', from: '08:00', to: '16:00', note: 'Сокращённый день' },
    ]);
  });

  it('понимает CSV с «;» и «,», кавычки и строку без типа (= выходной)', () => {
    expect(parseCalendarImport('04.11.2026;праздник\n05.11.2026', D).rows.map((r) => [r.date, r.kind])).toEqual([['2026-11-04', 'off'], ['2026-11-05', 'off']]);
    expect(parseCalendarImport('"04.11.2026","Выходной"', D).rows[0].date).toBe('2026-11-04');
  });

  it('сообщает номера строк с ошибками и не теряет остальные', () => {
    const r = parseCalendarImport(['04.11.2026\tВыходной', '32.13.2026\tВыходной', '05.11.2026\tОтпуск', '06.11.2026\tРабочий\t17:00\t08:00', '07.11.2026\tВыходной\t08:00\t17:00', '08.11.2026\tРабочий\t9:00'].join('\n'), D);
    expect(r.rows).toHaveLength(1);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6]);
  });

  it('повтор даты заменяет прежнюю строку и считается', () => {
    const r = parseCalendarImport('04.11.2026\tВыходной\n04.11.2026\tРабочий', D);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].kind).toBe('work');
    expect(r.duplicates).toBe(1);
  });

  it('пустой ввод и один заголовок — без строк и без ошибок', () => {
    expect(parseCalendarImport('', D)).toEqual({ rows: [], errors: [], duplicates: 0, format: 'table' });
    expect(parseCalendarImport('Дата;Тип', D).rows).toEqual([]);
  });
});

describe('матрица «год × месяцы»', () => {
  const header = ['Год/Месяц', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь', 'Всего рабочих дней'];
  const row = (year: string, months: Record<number, string>) => [year, ...Array.from({ length: 12 }, (_, i) => months[i + 1] ?? ''), '247'];
  const text = [header.join(';'), row('2026', { 1: '1,2,3,4,10,11', 2: '22*,23,28', 11: '3*,4,7,8,14+', 12: '31*' }).join(';')].join('\n');

  it('узнаёт формат, дни без пометки — выходные, «*» — сокращённые, «+» — рабочие по переносу', () => {
    const r = parseCalendarImport(text, D);
    expect(r.format).toBe('months');
    expect(r.errors).toEqual([]);
    const by = Object.fromEntries(r.rows.map((x) => [x.date, x]));
    expect(by['2026-01-01']).toMatchObject({ kind: 'off' });
    expect(by['2026-02-22']).toMatchObject({ kind: 'work', from: '08:00', to: '16:00', note: 'Сокращённый день' });
    expect(by['2026-11-14']).toMatchObject({ kind: 'work', from: null, note: 'Рабочий день (перенос)' });
    expect(by['2026-11-04'].kind).toBe('off');
    expect(by['2026-11-03'].kind).toBe('work');
    expect(r.rows).toHaveLength(6 + 3 + 5 + 1);
  });

  it('разделитель — табуляция; итоговые столбцы и строки без года игнорируются', () => {
    const tabs = [header.join('\t'), row('2026', { 5: '1,2,9,10' }).join('\t'), 'Всего\t\t\t'].join('\n');
    const r = parseCalendarImport(tabs, D);
    expect(r.format).toBe('months');
    expect(r.rows.map((x) => x.date)).toEqual(['2026-05-01', '2026-05-02', '2026-05-09', '2026-05-10']);
  });

  it('несуществующий день и мусор в ячейке — ошибки со строкой, остальное загружается', () => {
    const bad = [header.join(';'), row('2026', { 2: '30,28', 3: 'abc' }).join(';')].join('\n');
    const r = parseCalendarImport(bad, D);
    expect(r.rows.map((x) => x.date)).toEqual(['2026-02-28']);
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0].line).toBe(2);
  });

  it('несколько лет в одном файле', () => {
    const two = [header.join(';'), row('2026', { 1: '1' }).join(';'), row('2027', { 1: '1' }).join(';')].join('\n');
    expect(parseCalendarImport(two, D).rows.map((x) => x.date)).toEqual(['2026-01-01', '2027-01-01']);
  });
});
