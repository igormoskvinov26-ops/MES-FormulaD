import { useEffect, useMemo, useState } from 'react';
import { api, type ComponentCheck, type ComponentItem, type ControlPost, type NcpItem } from './api';
import { atvImageFor } from './atvVariant';
import { linePosition } from './lineProgress';
import type { Slot } from './calendar';
import { dash, formatDate, statusCodeLabel } from './format';
import { STATION_STATE_LABEL, stationState, type StationState } from './stationReadiness';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const forecastText = (slot: Slot) => {
  const [y, m, d] = slot.date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}${slot.time === '—' ? '' : `, ${slot.time}`}`;
};

export function AssemblyProgress({ slot, posts = [], onClose }: { slot: Slot; posts?: ControlPost[]; onClose: () => void }) {
  const { item } = slot;
  const [stations, setStations] = useState<string[] | null>(null);
  const [components, setComponents] = useState<ComponentItem[]>([]);
  const [checks, setChecks] = useState<Record<string, ComponentCheck>>({});
  const [ncpItems, setNcpItems] = useState<NcpItem[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.ncpStations(),
      api.ncpComponents(),
      api.stationChecks(item.vin).catch(() => ({}) as Record<string, ComponentCheck>),
      api.ncpList({ vin: item.vin, status: null, page: 1, pageSize: 100 }).then((r) => r.items).catch(() => [] as NcpItem[]),
    ])
      .then(([s, c, ch, n]) => {
        if (!alive) return;
        setStations(s); setComponents(c); setChecks(ch); setNcpItems(n);
      })
      .catch(() => alive && setError('Не удалось загрузить станции'));
    return () => { alive = false; };
  }, [item.vin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const states: StationState[] = useMemo(
    () => (stations ?? []).map((s) => stationState(s, { components, checks, ncpItems })),
    [stations, components, checks, ncpItems],
  );
  const position = linePosition(item.statusId, states);
  const image = atvImageFor(item) ?? '/atv-hero.png';
  const columns = (stations ?? []).flatMap((s, i) => [
    { kind: 'station' as const, station: s, index: i },
    ...posts.filter((p) => p.afterStation === s).map((post) => ({ kind: 'post' as const, post })),
  ]);
  const carColumn = Math.max(0, columns.findIndex((c) => c.kind === 'station' && c.index === position.index)) + 1;
  const caption = position.kind === 'before' ? 'Ожидает запуска' : position.kind === 'after' ? (item.statusId === 3 ? 'ФОК пройден' : 'Собрано, ждёт FOK') : 'В работе';

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal cal__progress" role="dialog" aria-modal="true" aria-label={`Прогресс сборки ${item.vin}`} onMouseDown={(e) => e.stopPropagation()}>
        <header className="cal__progress-head">
          <div>
            <span className="f7mes__label">ПРОГРЕСС СБОРКИ</span>
            <h2 className="mono">{item.vin}</h2>
            <p>{dash(item.modelName ?? item.modelArticle)} · {dash(item.color)}</p>
          </div>
          <button type="button" className="ghost icon-btn cal__close" aria-label="Закрыть" onClick={onClose}>×</button>
        </header>

        <dl className="cal__facts">
          <div><dt>Статус</dt><dd>{statusCodeLabel(item.statusId)}</dd></div>
          <div><dt>{slot.done ? 'Выпущено (ФОК)' : 'Прогноз выпуска'}</dt><dd>{forecastText(slot)}{slot.deltaDays !== null && slot.deltaDays !== 0 && <span className="cal__delta" data-tone={slot.deltaDays > 0 ? 'late' : 'early'}>{slot.deltaDays > 0 ? `+${slot.deltaDays} дн` : `−${Math.abs(slot.deltaDays)} дн`}</span>}</dd></div>
          <div><dt>План: завершение</dt><dd>{formatDate(item.plannedCompleteDate)}</dd></div>
          <div><dt>План: отгрузка</dt><dd>{formatDate(item.plannedShipmentDate)}</dd></div>
          <div><dt>Двигатель</dt><dd>{dash(item.engineNumber)}</dd></div>
          <div><dt>Комплектация</dt><dd>{dash(item.specificationName)}</dd></div>
        </dl>

        {error && <p role="alert" className="error">{error}</p>}
        {!stations && !error && <p className="muted" role="status">Загрузка станций…</p>}

        {stations && stations.length > 0 && (
          <section className="cal__line" aria-label="Линия станций" style={{ gridTemplateColumns: columns.map((c) => (c.kind === 'post' ? '52px' : 'minmax(64px, 1fr)')).join(' ') }}>
            <div className="cal__car" style={{ gridColumn: carColumn }} data-kind={position.kind} data-edge={position.index === 0 ? 'start' : position.index === stations.length - 1 ? 'end' : undefined}>
              <img src={image} alt="" draggable={false} />
              <span>{caption}</span>
            </div>
            <ol className="cal__stations">
              {columns.map((col) => {
                if (col.kind === 'post') {
                  return (
                    <li key={`post-${col.post.afterStation}-${col.post.name}`} className="cal__post" aria-label={`Пост контроля качества: ${col.post.name}`} title={col.post.name}>
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 2l6 2.5v5c0 4-2.6 6.8-6 8-3.4-1.2-6-4-6-8v-5z" /><path d="M7 10l2 2 4-4" /></svg>
                      <span>{col.post.name}</span>
                    </li>
                  );
                }
                const { station: s, index: i } = col;
                const list = components.filter((c) => c.station === s);
                const done = list.filter((c) => checks[c.code]?.checked).length;
                return (
                  <li key={s} data-state={states[i]} data-current={position.kind === 'on' && i === position.index ? 'true' : undefined} aria-label={`Станция ${s} — ${STATION_STATE_LABEL[states[i]]}`}>
                    <strong>{s}</strong>
                    <span title={list.length === 0 ? 'К станции не привязаны компоненты' : undefined}>{list.length === 0 ? '—' : `${done} из ${list.length}`}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
        {posts.length === 0 && <p className="muted cal__hint">Посты контроля качества не заданы.</p>}

        <div className="modal-actions">
          <button type="button" className="primary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
