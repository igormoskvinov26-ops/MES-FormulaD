import { describe, expect, it } from 'vitest';
import type { ProductionPlanItem } from './api';
import { DEFAULT_CONFIG, addDays, addMonths, releasedSlots, dayHourRows, dayInfo, monthGrid, diffDays, isWorkday, mondayOf, scheduleItems, slotTime, weekColumns, type CalendarConfig } from './calendar';

function item(vin: string, statusId: number | null, plannedCompleteDate: string | null = null): ProductionPlanItem {
  return {
    vin, id: 1, seqn: 1, modelArticle: 'DEMO-800', modelName: 'M', engineNumber: null, color: 'Красный', specificationName: null,
    status: null, statusId, printDate: null, plannedStartDate: null, plannedCompleteDate, plannedShipmentDate: null,
    startDate: null, completeDate: null, fokDate: null,
  };
}
const many = (n: number, statusId: number | null = 0) => Array.from({ length: n }, (_, i) => item(`V${i + 1}`, statusId));
// 2026-11-09 — понедельник; 2026-11-06 — пятница
const morning = (d: string) => new Date(`${d}T07:00:00`);

describe('даты', () => {
  it('понедельник недели, сложение дней, разница', () => {
    expect(mondayOf('2026-11-06')).toBe('2026-11-02');
    expect(mondayOf('2026-11-08')).toBe('2026-11-02'); // воскресенье
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(diffDays('2026-11-09', '2026-11-06')).toBe(3);
  });
  it('выходные и праздники — нерабочие', () => {
    expect(isWorkday('2026-11-07')).toBe(false); // сб
    expect(isWorkday('2026-11-09')).toBe(true);
    expect(isWorkday('2026-11-09', { ...DEFAULT_CONFIG, overrides: { '2026-11-09': { kind: 'off', from: null, to: null, note: 'Праздник' } } })).toBe(false);
  });
  it('перенесённый рабочий день: суббота с отметкой «work» рабочая', () => {
    const cfg: CalendarConfig = { ...DEFAULT_CONFIG, overrides: { '2026-11-07': { kind: 'work', from: null, to: null, note: null } } };
    expect(isWorkday('2026-11-07', cfg)).toBe(true);
    expect(dayInfo('2026-11-07', cfg).capacity).toBe(8);
  });
});

describe('время слотов', () => {
  it('8 изделий в смену 08–17 с обедом 12–13: по одному в час, без обеда', () => {
    expect(Array.from({ length: 8 }, (_, i) => slotTime(i))).toEqual(['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00']);
  });
  it('4 изделия в смену — каждые два рабочих часа', () => {
    expect(Array.from({ length: 4 }, (_, i) => slotTime(i, { ...DEFAULT_CONFIG, perShift: 4 }))).toEqual(['08:00', '10:00', '13:00', '15:00']);
  });
});

describe('особые часы дня', () => {
  it('сокращённый день 08–16 вмещает 7 изделий: производительность пропорциональна рабочему времени', () => {
    const cfg: CalendarConfig = { ...DEFAULT_CONFIG, overrides: { '2026-11-09': { kind: 'work', from: '08:00', to: '16:00', note: null } } };
    expect(dayInfo('2026-11-09', cfg).capacity).toBe(7);
    const s = scheduleItems(many(8), morning('2026-11-09'), cfg);
    expect(s.filter((x) => x.date === '2026-11-09')).toHaveLength(7);
    expect(s[7].date).toBe('2026-11-10');
  });
  it('удлинённый день 08–19 вмещает 10; перерыв вне часов дня не вычитается', () => {
    const cfg: CalendarConfig = { ...DEFAULT_CONFIG, overrides: { '2026-11-09': { kind: 'work', from: '08:00', to: '19:00', note: null }, '2026-11-10': { kind: 'work', from: '14:00', to: '17:00', note: null } } };
    expect(dayInfo('2026-11-09', cfg).capacity).toBe(10);
    expect(dayInfo('2026-11-10', cfg).capacity).toBe(3);
  });
  it('выходной по отметке пропускается при раскладке; день короче одного слота — тоже', () => {
    const cfg: CalendarConfig = { ...DEFAULT_CONFIG, overrides: { '2026-11-09': { kind: 'off', from: null, to: null, note: null }, '2026-11-10': { kind: 'work', from: '08:00', to: '08:30', note: null } } };
    expect(scheduleItems(many(1), morning('2026-11-09'), cfg)[0].date).toBe('2026-11-11');
  });
});

describe('scheduleItems', () => {
  it('заполняет день по производительности и переходит на следующий рабочий', () => {
    const s = scheduleItems(many(10), morning('2026-11-09'));
    expect(s.filter((x) => x.date === '2026-11-09')).toHaveLength(8);
    expect(s.filter((x) => x.date === '2026-11-10')).toHaveLength(2);
    expect(s[0].time).toBe('08:00');
  });
  it('пропускает выходные: пятничный перелив уходит на понедельник', () => {
    const s = scheduleItems(many(9), morning('2026-11-06'));
    expect(s[8].date).toBe('2026-11-09');
  });
  it('в выходной начинает с ближайшего рабочего дня', () => {
    expect(scheduleItems(many(1), morning('2026-11-07'))[0].date).toBe('2026-11-09');
  });
  it('середина дня: слоты раньше текущего времени не занимает', () => {
    const s = scheduleItems(many(2), new Date('2026-11-09T10:30:00'));
    expect(s[0].time).toBe('11:00');
  });
  it('после конца смены начинает со следующего дня', () => {
    expect(scheduleItems(many(1), new Date('2026-11-09T18:00:00'))[0].date).toBe('2026-11-10');
  });
  it('начатые (1, 2, 4) идут первыми, ФОК (3) в прогноз не входит, пустой статус — как запланированный', () => {
    const items = [item('PLAN', 0), item('NULL', null), item('FOK', 3), item('WORK', 1), item('DONE', 2), item('RW', 4)];
    expect(scheduleItems(items, morning('2026-11-09')).map((x) => x.item.vin)).toEqual(['WORK', 'DONE', 'RW', 'PLAN', 'NULL']);
    expect(scheduleItems(items, morning('2026-11-09')).filter((x) => x.pinned)).toHaveLength(3);
  });
  it('считает отклонение от плановой даты завершения', () => {
    const [late, early, none] = scheduleItems(
      [item('A', 0, '2026-11-06T00:00:00'), item('B', 0, '2026-11-12T00:00:00'), item('C', 0)],
      morning('2026-11-09'),
    );
    expect(late.deltaDays).toBe(3); // прогноз 09.11, план 06.11
    expect(early.deltaDays).toBe(-3);
    expect(none.deltaDays).toBeNull();
  });
  it('учитывает производительность из настройки', () => {
    const cfg: CalendarConfig = { ...DEFAULT_CONFIG, perShift: 2 };
    expect(scheduleItems(many(3), morning('2026-11-09'), cfg).map((x) => x.date)).toEqual(['2026-11-09', '2026-11-09', '2026-11-10']);
  });
});

describe('weekColumns', () => {
  it('семь колонок пн–вс с признаком рабочего дня и слотами дня', () => {
    const slots = scheduleItems(many(9), morning('2026-11-06'));
    const week = weekColumns('2026-11-06', slots);
    expect(week.map((d) => d.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(week.map((d) => d.working)).toEqual([true, true, true, true, true, false, false]);
    expect(week[4].capacity).toBe(8);
    expect(week[4].slots).toHaveLength(8);
  });
});

describe('месяц', () => {
  it('сетка ноября 2026 (1-е — воскресенье, 30-е — понедельник): с пн 26 октября по вс 6 декабря, 6 недель', () => {
    const g = monthGrid('2026-11-15');
    expect(g[0]).toBe('2026-10-26');
    expect(g.at(-1)).toBe('2026-12-06');
    expect(g).toHaveLength(42);
  });
  it('месяц, начинающийся с понедельника и заканчивающийся воскресеньем, — ровно 4 недели', () => {
    expect(monthGrid('2027-02-10')).toHaveLength(28);
  });
  it('сдвиг месяцев через границу года', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01');
  });
});

describe('часовые строки дня', () => {
  it('рабочий день 08–17: девять часов, 12:00 — перерыв, слоты в своих часах', () => {
    const slots = scheduleItems(many(3), morning('2026-11-09'));
    const rows = dayHourRows(dayInfo('2026-11-09'), slots);
    expect(rows.map((r) => r.label)).toEqual(['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']);
    expect(rows.filter((r) => r.isBreak).map((r) => r.label)).toEqual(['12:00']);
    expect(rows[0].slots).toHaveLength(1);
    expect(rows[2].slots[0].time).toBe('10:00');
    expect(rows[3].slots).toHaveLength(0);
  });
  it('особые часы 09–15 дают строки только этого диапазона; выходной — пустой список', () => {
    const cfg: CalendarConfig = { ...DEFAULT_CONFIG, overrides: { '2026-11-09': { kind: 'work', from: '09:00', to: '15:00', note: null }, '2026-11-10': { kind: 'off', from: null, to: null, note: null } } };
    expect(dayHourRows(dayInfo('2026-11-09', cfg), [], cfg).map((r) => r.label)).toEqual(['09:00', '10:00', '11:00', '12:00', '13:00', '14:00']);
    expect(dayHourRows(dayInfo('2026-11-10', cfg), [], cfg)).toEqual([]);
  });
});

describe('releasedSlots — история выпуска', () => {
  it('изделия с ФОК встают в день фактической даты ФОК, закреплены и помечены выпущенными', () => {
    const fok = (vin: string, stamp: string | null, planned: string | null = null) => ({ ...item(vin, 3, planned), fokDate: stamp });
    const r = releasedSlots([fok('B', '2026-11-05T15:30:00'), fok('A', '2026-11-05T09:10:00', '2026-11-03T00:00:00'), fok('NODATE', null), fok('DATEONLY', '2026-11-04T00:00:00'), item('PLAN', 0)]);
    expect(r.map((s) => [s.item.vin, s.date, s.time])).toEqual([['DATEONLY', '2026-11-04', '—'], ['A', '2026-11-05', '09:10'], ['B', '2026-11-05', '15:30']]);
    expect(r.every((s) => s.done && s.pinned)).toBe(true);
    expect(r[1].deltaDays).toBe(2); // ФОК 05.11, план 03.11
  });
});
