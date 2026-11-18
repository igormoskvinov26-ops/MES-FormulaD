import type { CalendarSettings } from './api';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);

/** Проверка графика до отправки; правила те же, что на сервере (`ProductionCalendarStore.ValidateSettings`). Возвращает текст ошибки или null. */
export function validateSettings(s: CalendarSettings): string | null {
  if (s.workdays.length === 0) return 'Отметьте хотя бы один рабочий день.';
  if (!TIME.test(s.shiftStart) || !TIME.test(s.shiftEnd)) return 'Смена: укажите начало и конец.';
  if (minutes(s.shiftStart) >= minutes(s.shiftEnd)) return 'Начало смены должно быть раньше конца.';
  if (s.breaks.length > 4) return 'Перерывов не больше четырёх.';
  for (const b of s.breaks) {
    if (!TIME.test(b.from) || !TIME.test(b.to)) return 'Перерыв: укажите начало и конец.';
    if (minutes(b.from) >= minutes(b.to)) return 'Начало перерыва должно быть раньше конца.';
    if (minutes(b.from) < minutes(s.shiftStart) || minutes(b.to) > minutes(s.shiftEnd)) return 'Перерыв должен быть внутри смены.';
  }
  const sorted = [...s.breaks].sort((a, b) => minutes(a.from) - minutes(b.from));
  for (let i = 1; i < sorted.length; i++) if (minutes(sorted[i].from) < minutes(sorted[i - 1].to)) return 'Перерывы не должны пересекаться.';
  const work = workMinutes(s);
  if (work <= 0) return 'В смене не остаётся рабочего времени.';
  if (!Number.isInteger(s.perShift) || s.perShift < 1 || s.perShift > 500) return 'Изделий в смену: целое число от 1 до 500.';
  if (s.perShift > work) return 'Изделий в смену не может быть больше, чем рабочих минут.';
  const posts = s.controlPosts ?? [];
  if (posts.length > 10) return 'Постов контроля не больше десяти.';
  for (const p of posts) {
    if (p.name.trim().length === 0 || p.name.trim().length > 40) return 'Пост контроля: название от 1 до 40 символов.';
    if (p.afterStation.trim().length === 0) return 'Пост контроля: выберите станцию, после которой он стоит.';
  }
  return null;
}

/** Рабочих минут в смене без перерывов (при корректных данных). */
export const workMinutes = (s: CalendarSettings) =>
  minutes(s.shiftEnd) - minutes(s.shiftStart) - s.breaks.reduce((sum, b) => sum + Math.max(0, minutes(b.to) - minutes(b.from)), 0);

/** Одно изделие каждые N минут рабочего времени — подсказка рядом с производительностью. */
export const takt = (s: CalendarSettings) => (s.perShift > 0 ? workMinutes(s) / s.perShift : 0);
