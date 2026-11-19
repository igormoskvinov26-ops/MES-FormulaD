import { describe, expect, it } from 'vitest';
import type { CalendarSettings } from './api';
import { takt, validateSettings, workMinutes } from './calendarSettings';

const OK: CalendarSettings = { workdays: [1, 2, 3, 4, 5], shiftStart: '08:00', shiftEnd: '17:00', breaks: [{ from: '12:00', to: '13:00' }], perShift: 8 };
const with_ = (p: Partial<CalendarSettings>) => ({ ...OK, ...p });

describe('validateSettings', () => {
  it('стандартный график корректен; такт — раз в час', () => {
    expect(validateSettings(OK)).toBeNull();
    expect(workMinutes(OK)).toBe(480);
    expect(takt(OK)).toBe(60);
    expect(validateSettings(with_({ controlPosts: [{ name: 'Пост 1', afterStation: '4' }] }))).toBeNull();
  });
  it.each([
    [with_({ workdays: [] }), 'рабочий день'],
    [with_({ shiftStart: '', shiftEnd: '17:00' }), 'начало и конец'],
    [with_({ shiftStart: '17:00', shiftEnd: '08:00' }), 'раньше конца'],
    [with_({ breaks: [{ from: '07:00', to: '08:30' }] }), 'внутри смены'],
    [with_({ breaks: [{ from: '13:00', to: '12:00' }] }), 'раньше конца'],
    [with_({ breaks: [{ from: '12:00', to: '13:00' }, { from: '12:30', to: '13:30' }] }), 'пересекаться'],
    [with_({ breaks: [{ from: '08:00', to: '17:00' }] }), 'не остаётся'],
    [with_({ breaks: [1, 2, 3, 4, 5].map((h) => ({ from: `0${h + 3}:00`, to: `0${h + 3}:10` })) }), 'не больше четырёх'],
    [with_({ perShift: 0 }), 'от 1 до 500'],
    [with_({ perShift: 2.5 }), 'целое число'],
    [with_({ perShift: 501 }), 'от 1 до 500'],
    [with_({ perShift: 500, shiftStart: '08:00', shiftEnd: '10:00', breaks: [] }), 'рабочих минут'],
    [with_({ controlPosts: [{ name: '  ', afterStation: '4' }] }), 'название'],
    [with_({ controlPosts: [{ name: 'Пост', afterStation: '' }] }), 'станцию'],
    [with_({ controlPosts: Array.from({ length: 11 }, (_, i) => ({ name: `П${i}`, afterStation: '1' })) }), 'не больше десяти'],
  ])('отвергает %#', (settings, part) => {
    expect(validateSettings(settings)).toContain(part);
  });
});
