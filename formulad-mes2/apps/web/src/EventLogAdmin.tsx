import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type EventLogEntry } from './api';

const ENTITY_LABELS: Record<string, string> = {
  ProductionPlan: 'План',
  Ncp: 'Несоответствие (NCP)',
  Calendar: 'Календарь',
  Delivery: 'Поставка',
  Package: 'Коробка',
  PackingList: 'Packing List',
  PackingListRow: 'Строка Packing List',
  PlanImport: 'Импорт плана',
  Component: 'Компонент',
};
const ACTION_LABELS: Record<string, string> = {
  Move: 'Перестановка', Create: 'Создание', Close: 'Закрытие', Reopen: 'Повторное открытие', Print: 'Печать', Import: 'Импорт',
  Stage: 'Подготовка', Confirm: 'Подтверждение', EditRow: 'Правка строки', Check: 'Проверка', IncreaseQuota: 'Увеличение норматива',
  PartInstalled: 'Деталь установлена', Publish: 'Публикация', Set: 'Установка', Reset: 'Сброс', Settings: 'Настройки', Add: 'Добавление',
  Start: 'Старт', Complete: 'Завершение', Fok: 'FOK', Rework: 'Rework',
};
const LIMITS = [50, 100, 200, 500];

export const formatStamp = (iso: string) => {
  const [date, time] = iso.split('T');
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y} ${(time ?? '').slice(0, 8)}`;
};

/** Раздел «Журнал событий»: кто, когда и что изменил. Только чтение; новые записи первыми. */
export function EventLogAdmin() {
  const [entries, setEntries] = useState<EventLogEntry[] | null>(null);
  const [entityType, setEntityType] = useState('');
  const [entityKey, setEntityKey] = useState('');
  const [limit, setLimit] = useState(100);
  const [error, setError] = useState('');
  const [knownTypes, setKnownTypes] = useState<string[]>([]);

  const load = useCallback(() => {
    setError('');
    api.events({ entityType: entityType || undefined, entityKey: entityKey.trim() || undefined, limit })
      .then((rows) => {
        setEntries(rows);
        // список типов для фильтра копим из увиденного: выбранный тип не должен «пропадать» из списка
        setKnownTypes((prev) => [...new Set([...prev, ...rows.map((r) => r.entityType)])].sort());
      })
      .catch(() => setError('Не удалось загрузить журнал'));
  }, [entityType, entityKey, limit]);

  useEffect(load, [load]);

  const types = useMemo(() => (entityType && !knownTypes.includes(entityType) ? [...knownTypes, entityType] : knownTypes), [knownTypes, entityType]);

  return (
    <div className="calendar-admin">
      <section className="rep-card" aria-label="Журнал событий">
        <div className="cal__list-head">
          <h2>Журнал событий</h2>
          <button type="button" onClick={load}>Обновить</button>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Кто, когда и что изменил: перестановки плана, несоответствия, входной контроль, импорт, календарь. Записи только добавляются. В режиме Demo журнал живёт в памяти и очищается при перезапуске; в режиме Sql он сохраняется в файл (`EventLog:StorePath`).
        </p>
        <div className="cal__add">
          <label>Объект
            <select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
              <option value="">Все</option>
              {types.map((t) => <option key={t} value={t}>{ENTITY_LABELS[t] ?? t}</option>)}
            </select>
          </label>
          <label>Ключ (VIN, номер…)<input value={entityKey} maxLength={100} onChange={(e) => setEntityKey(e.target.value)} /></label>
          <label>Показать
            <select value={limit} onChange={(e) => setLimit(+e.target.value)}>
              {LIMITS.map((n) => <option key={n} value={n}>последние {n}</option>)}
            </select>
          </label>
        </div>
        {error && <p role="alert" className="error" style={{ margin: 0 }}>{error}</p>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Время</th><th>Пользователь</th><th>Объект</th><th>Ключ</th><th>Действие</th><th>Было</th><th>Стало</th></tr></thead>
            <tbody>
              {(entries ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="mono">{formatStamp(e.occurredAt)}</td>
                  <td>{e.userName}</td>
                  <td title={e.entityType}>{ENTITY_LABELS[e.entityType] ?? e.entityType}</td>
                  <td className="mono">{e.entityKey}</td>
                  <td title={e.action}>{ACTION_LABELS[e.action] ?? e.action}</td>
                  <td>{e.oldValue ?? '—'}</td>
                  <td>{e.newValue ?? '—'}</td>
                </tr>
              ))}
              {entries !== null && entries.length === 0 && <tr><td colSpan={7} className="center muted">Записей нет</td></tr>}
              {entries === null && !error && <tr><td colSpan={7} className="center muted">Загрузка…</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
