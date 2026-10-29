import { useEffect, useState } from 'react';
import type { Screen } from './AppHeader';
import { AppHeader } from './AppHeader';
import { ApiError, api, type ComponentCheck, type ComponentItem, type NcpItem, type ProductionPlanItem } from './api';
import { NcpCreateDialog } from './NcpCreateDialog';
import { formatDate } from './format';

type StationState = 'grey' | 'blue' | 'green' | 'yellow' | 'red';

/** Раздел 11.1 спецификации: своя цветовая схема станции, отдельная от бейджей состояния
    изделия на плане (docs/DESIGN_DIRECTION.md — специально не путаем две палитры). */
const STATE_LABEL: Record<StationState, string> = {
  grey: 'не начата',
  blue: 'выбрана',
  green: 'выполнено',
  yellow: 'частично',
  red: 'есть несоответствие',
};

export function StationScreen({
  session,
  onNavigate,
  onLogout,
}: {
  session: { userName: string | null; mode: string };
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
}) {
  const [vinInput, setVinInput] = useState('');
  const [vin, setVin] = useState<string | null>(null);
  const [item, setItem] = useState<ProductionPlanItem | null>(null);
  const [lookupError, setLookupError] = useState('');

  const [stationsList, setStationsList] = useState<string[]>([]);
  const [components, setComponents] = useState<ComponentItem[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [checks, setChecks] = useState<Record<string, ComponentCheck>>({});
  const [ncpItems, setNcpItems] = useState<NcpItem[]>([]);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [ncpDraft, setNcpDraft] = useState<{ station: string; componentCode: string } | null>(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    api.ncpStations().then(setStationsList).catch(() => setStationsList([]));
    api.ncpComponents().then(setComponents).catch(() => setComponents([]));
    api.ncpTypes().then(setTypes).catch(() => setTypes([]));
  }, []);

  async function reloadVinData(value: string) {
    const [checksResult, ncpResult] = await Promise.all([
      api.stationChecks(value),
      api.ncpList({ vin: value, status: null, page: 1, pageSize: 100 }),
    ]);
    setChecks(checksResult);
    setNcpItems(ncpResult.items);
  }

  async function openVin(value: string) {
    setLookupError('');
    setActionError('');
    let found: ProductionPlanItem;
    try {
      found = await api.byVin(value);
    } catch (e) {
      setItem(null);
      setVin(null);
      setLookupError(e instanceof ApiError && e.status === 404 ? `VIN ${value} не найден` : 'Нет связи с сервером');
      return;
    }

    setItem(found);
    setVin(found.vin);
    setSelectedStation(null);
    try {
      await reloadVinData(found.vin);
    } catch {
      // VIN найден — показываем карточку и линию станций без отметок, а не прячем всё за ошибкой поиска.
      setActionError('Не удалось загрузить отметки станций и несоответствия');
    }
  }

  function componentsFor(station: string): ComponentItem[] {
    return components.filter((c) => c.station === station);
  }

  function hasOpenNcp(station: string): boolean {
    return ncpItems.some((n) => n.station === station && n.status !== 'Закрыто');
  }

  // Раздел 11.1 + мой ответ по умолчанию на В-15 (docs/DEVELOPMENT_PLAN.md, Этап 5):
  // станция завершена, когда все привязанные компоненты отмечены и нет новой незакрытой NCP
  // с этой станции. Незакрытая NCP важнее хода проверки — показываем красным в любом случае,
  // кроме случая, когда станция сейчас открыта оператором (это тоже должно быть видно).
  function stationState(station: string): StationState {
    if (hasOpenNcp(station)) return 'red';
    if (selectedStation === station) return 'blue';
    const list = componentsFor(station);
    if (list.length === 0) return 'grey';
    const checkedCount = list.filter((c) => checks[c.code]?.checked).length;
    if (checkedCount === 0) return 'grey';
    return checkedCount === list.length ? 'green' : 'yellow';
  }

  async function toggleCheck(code: string, value: boolean) {
    if (!vin) return;
    setActionError('');
    try {
      const updated = await api.setStationCheck(vin, code, value);
      setChecks((prev) => ({ ...prev, [code]: updated }));
    } catch {
      setActionError('Не удалось обновить отметку проверки');
    }
  }

  async function checkAll(station: string, value: boolean) {
    if (!vin) return;
    setActionError('');
    const codes = componentsFor(station).map((c) => c.code);
    try {
      const results = await Promise.all(codes.map((code) => api.setStationCheck(vin, code, value)));
      setChecks((prev) => {
        const next = { ...prev };
        for (const r of results) next[r.componentCode] = r;
        return next;
      });
    } catch {
      setActionError('Не удалось обновить отметки станции');
    }
  }

  async function createNcp(input: Parameters<typeof api.ncpCreate>[0]) {
    setActionError('');
    try {
      await api.ncpCreate(input);
      setNcpDraft(null);
      if (vin) await reloadVinData(vin);
    } catch {
      setActionError('Не удалось зарегистрировать несоответствие');
    }
  }

  const selectedComponents = selectedStation ? componentsFor(selectedStation) : [];

  return (
    <div className="app">
      <AppHeader screen="stations" onNavigate={onNavigate} session={session} onLogout={onLogout} />

      <section className="toolbar">
        <form
          className="controls"
          onSubmit={(event) => {
            event.preventDefault();
            const value = vinInput.trim();
            if (value) void openVin(value);
          }}
        >
          <input
            className="search"
            aria-label="VIN изделия"
            placeholder="Сканируйте или введите VIN"
            value={vinInput}
            maxLength={50}
            autoFocus
            onChange={(event) => setVinInput(event.target.value)}
          />
          <button type="submit" className="primary">
            Открыть
          </button>
        </form>

        {item && (
          <div className="meta">
            <strong className="mono vin">{item.vin}</strong>
            <span className="muted">
              {item.modelName ?? item.modelArticle ?? '—'} · {item.color ?? '—'}
            </span>
          </div>
        )}
      </section>

      {lookupError && (
        <p role="alert" className="error" style={{ margin: '12px 18px 0' }}>
          {lookupError}
        </p>
      )}
      {actionError && (
        <p role="alert" className="error" style={{ margin: '12px 18px 0' }}>
          {actionError}
        </p>
      )}

      {!item && (
        <p className="center muted">Введите или отсканируйте VIN, чтобы увидеть линию станций</p>
      )}

      {item && (
        <main className="content content-wide">
          <ul className="station-line" aria-label="Станции">
            {stationsList.map((s) => {
              const state = stationState(s);
              return (
                <li key={s}>
                  <button
                    type="button"
                    className={`station-btn station-${state}`}
                    aria-pressed={selectedStation === s}
                    aria-label={`Станция ${s} — ${STATE_LABEL[state]}`}
                    title={`Станция ${s} — ${STATE_LABEL[state]}`}
                    onClick={() => setSelectedStation(s)}
                  >
                    {s}
                  </button>
                </li>
              );
            })}
          </ul>

          <ul className="legend station-legend">
            {(Object.keys(STATE_LABEL) as StationState[]).map((key) => (
              <li key={key}>
                <i className={`swatch station-${key}`} aria-hidden="true" />
                {STATE_LABEL[key]}
              </li>
            ))}
          </ul>

          {selectedStation && (
            <div className="card station-detail">
              <div className="station-detail-head">
                <h2>Станция {selectedStation}</h2>
                <div className="ncp-actions">
                  <button
                    type="button"
                    onClick={() => void checkAll(selectedStation, true)}
                    disabled={selectedComponents.length === 0}
                  >
                    Проверено всё
                  </button>
                  <button
                    type="button"
                    onClick={() => void checkAll(selectedStation, false)}
                    disabled={selectedComponents.length === 0}
                  >
                    Снять проверку
                  </button>
                </div>
              </div>

              {selectedComponents.length === 0 && (
                <p className="muted">Для этой станции нет привязанных компонентов</p>
              )}

              {selectedComponents.length > 0 && (
                <ul className="station-components">
                  {selectedComponents.map((c) => {
                    const check = checks[c.code];
                    return (
                      <li key={c.code}>
                        <label className="station-component">
                          <input
                            type="checkbox"
                            checked={Boolean(check?.checked)}
                            onChange={(event) => void toggleCheck(c.code, event.target.checked)}
                          />
                          <span>{c.name}</span>
                          {check?.checked && (
                            <span className="muted">
                              — {check.checkedBy}, {formatDate(check.checkedAt)}
                            </span>
                          )}
                        </label>
                        <button
                          type="button"
                          onClick={() => setNcpDraft({ station: selectedStation, componentCode: c.code })}
                        >
                          Зафиксировать расхождение
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </main>
      )}

      {ncpDraft && vin && (
        <NcpCreateDialog
          types={types}
          stations={stationsList}
          components={components}
          defaultVin={vin}
          defaultStation={ncpDraft.station}
          defaultComponentCode={ncpDraft.componentCode}
          onCreate={(input) => void createNcp(input)}
          onClose={() => setNcpDraft(null)}
        />
      )}
    </div>
  );
}
