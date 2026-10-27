/** Статусы базы отображаем как есть; классифицируем только известные значения. */
const KNOWN: Record<string, { label: string; tone: 'info' | 'progress' | 'done' | 'ok' }> = {
  planned: { label: 'В плане', tone: 'info' },
  'in progress': { label: 'В сборке', tone: 'progress' },
  complete: { label: 'Собрано', tone: 'done' },
  FOK: { label: 'ФОК', tone: 'ok' },
};

export type StatusBadge = { label: string; tone: string; title: string };

export function statusBadge(status: string | null): StatusBadge {
  if (status === null) return { label: 'Без статуса', tone: 'none', title: 'Status IS NULL' };
  const known = KNOWN[status];
  // Неизвестное значение не ломает UI: «Другое» + оригинальный текст.
  return known
    ? { label: known.label, tone: known.tone, title: status }
    : { label: `Другое: ${status}`, tone: 'unknown', title: status };
}

/** SQL datetime без зоны: показываем как есть, без конвертации в UTC. Пусто → «—». */
export function formatDate(value: string | null): string {
  if (!value) return '—';
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-');
  // Полночь в SQL-плане означает «дата без времени» — время не показываем.
  const clock = time?.slice(0, 5);
  return clock && clock !== '00:00' ? `${day}.${month}.${year} ${clock}` : `${day}.${month}.${year}`;
}

export function dash(value: string | number | null): string {
  return value === null || value === '' ? '—' : String(value);
}

export type RowState = {
  key: 'waiting' | 'in-work' | 'complete' | 'fok';
  label: string;
};

/**
 * Состояние изделия для подсветки строки. В Access это кодировалось только цветом
 * (зелёный фон — запущено, фиолетовый VIN — в ожидании), поэтому здесь состояние
 * всегда дублируется словом в отдельной колонке и подписано в легенде.
 */
export function rowState(item: {
  startDate: string | null;
  completeDate: string | null;
  fokDate: string | null;
}): RowState {
  if (item.fokDate) return { key: 'fok', label: 'ФОК пройден' };
  if (item.completeDate) return { key: 'complete', label: 'Собрано' };
  if (item.startDate) return { key: 'in-work', label: 'В производстве' };
  return { key: 'waiting', label: 'В ожидании' };
}
