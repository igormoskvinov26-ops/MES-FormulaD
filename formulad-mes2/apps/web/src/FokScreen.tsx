import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Screen } from './AppHeader';
import { AppHeader } from './AppHeader';
import { ApiError, api, type ComponentCheck, type ComponentItem, type NcpItem, type ProductionPlanItem } from './api';
import { dash, statusCodeLabel } from './format';
import { ReadinessTwin, type TwinMode } from './ReadinessTwin';
import { StationDetailCard } from './StationDetailCard';
import { readinessSummary, stationState } from './stationReadiness';
import './f7-components.css';

export function FokScreen({
  session,
  onNavigate,
  onLogout,
}: {
  session: { userName: string | null; mode: string };
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
}) {
  const [input, setInput] = useState('');
  const [found, setFound] = useState<ProductionPlanItem | null>(null);
  const [missing, setMissing] = useState<NcpItem[]>([]);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ProductionPlanItem[]>([]);
  const [stations, setStations] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [components, setComponents] = useState<ComponentItem[]>([]);
  const [checks, setChecks] = useState<Record<string, ComponentCheck>>({});
  const [ncpItems, setNcpItems] = useState<NcpItem[]>([]);
  const [doneKind, setDoneKind] = useState<'fok' | 'rework' | null>(null);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const scanId = useId();

  const blocked = missing.length > 0;
  const eligible = found !== null && found.statusId === 2 && !blocked && message === null;

  const reloadPending = useCallback(() => {
    api.plan({ statusId: 2, page: 1, pageSize: 25 }).then(p => setPending(p.items)).catch(() => {});
  }, []);

  useEffect(reloadPending, [reloadPending]);
  useEffect(() => { api.ncpStations().then(setStations).catch(() => {}); }, []);
  useEffect(() => { api.ncpComponents().then(setComponents).catch(() => {}); }, []);
  useEffect(() => { focusInput(); }, []);
  useEffect(() => {
    if (!selectedStation || showModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedStation(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedStation, showModal]);

  function focusInput() {
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  // Отметки станций и NCP нужны только для схемы готовности: их сбой не мешает самой операции FOK.
  async function loadReadiness(vin: string, id: number) {
    const [c, n] = await Promise.all([
      api.stationChecks(vin).catch(() => ({}) as Record<string, ComponentCheck>),
      api.ncpList({ vin, status: null, page: 1, pageSize: 100 }).then((r) => r.items).catch(() => [] as NcpItem[]),
    ]);
    if (id !== requestId.current) return;
    setChecks(c);
    setNcpItems(n);
  }

  function clearUnit() { setFound(null); setMissing([]); setChecks({}); setNcpItems([]); setSelectedStation(null); }

  async function lookup(vin: string) {
    const id = ++requestId.current;
    setBusy(true);
    setDoneKind(null);
    setSelectedStation(null);
    try {
      const item = await api.byVin(vin);
      if (id !== requestId.current) return;
      setFound(item);
      void loadReadiness(item.vin, id);

      if (item.statusId !== 2) {
        setMissing([]);
        setMessage({ kind: 'error', text: `Статус «${statusCodeLabel(item.statusId)}», ожидался «${statusCodeLabel(2)}» — перевести нельзя.` });
      } else {
        const parts = await api.ncpMissingParts(item.vin);
        if (id !== requestId.current) return;
        setMissing(parts);
        setMessage(parts.length > 0 ? { kind: 'error', text: `Есть незакрытая обязательная деталь: ${parts.map(m => m.number).join(', ')}.` } : null);
      }
    } catch (e) {
      if (id !== requestId.current) return;
      clearUnit();
      setMessage({ kind: 'error', text: e instanceof ApiError && e.status === 404 ? `VIN ${vin} не найден` : 'Нет связи с сервером' });
    } finally {
      if (id === requestId.current) { setBusy(false); focusInput(); }
    }
  }

  async function confirm(vin: string) {
    setBusy(true);
    try {
      await api.fok(vin);
      clearUnit();
      setDoneKind('fok');
      setMessage({ kind: 'ok', text: `Готово: ${vin} → «${statusCodeLabel(3)}»` });
      reloadPending();
    } catch {
      clearUnit();
      setMessage({ kind: 'error', text: 'Не удалось выполнить переход — отсканируйте VIN ещё раз' });
    } finally { setBusy(false); setInput(''); focusInput(); }
  }

  async function sendToRework(vin: string) {
    setBusy(true);
    try {
      await api.sendToRework(vin);
      clearUnit();
      setDoneKind('rework');
      setMessage({ kind: 'ok', text: `Готово: ${vin} → «${statusCodeLabel(4)}»` });
      reloadPending();
    } catch {
      clearUnit();
      setMessage({ kind: 'error', text: 'Не удалось выполнить переход — отсканируйте VIN ещё раз' });
    } finally { setBusy(false); setInput(''); focusInput(); }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = input.trim();
    if (!v || busy) return;
    if (found && eligible && v.toLowerCase() === found.vin.toLowerCase()) {
      setShowModal(true);
    } else {
      void lookup(v);
      setInput('');
    }
  }

  function reset() { clearUnit(); setMessage(null); setDoneKind(null); focusInput(); }

  const summary = readinessSummary(stations, { components, checks, ncpItems });
  const statusOk = found?.statusId === 2;
  const twinMode: TwinMode = doneKind === 'fok' ? 'done'
    : !found ? 'idle'
    : blocked || !statusOk ? 'blocked'
    : eligible ? 'ready' : 'idle';
  const twinStates = doneKind === 'fok' ? stations.map(() => 'green' as const)
    : found ? summary.states : stations.map(() => 'grey' as const);

  // Только первые два условия блокируют FOK (так считает сервер); остальные — справочные.
  type Condition = { key: string; label: string; detail: string; state: 'ok' | 'fail' | 'warn' | 'idle'; action?: { label: string; run: () => void } };
  const conditions: Condition[] = [
    { key: 'status', label: 'Статус «Производство завершено»',
      detail: found ? statusCodeLabel(found.statusId) : 'ожидает скана',
      state: !found ? 'idle' : statusOk ? 'ok' : 'fail' },
    { key: 'parts', label: 'Обязательные детали установлены',
      detail: !found || !statusOk ? 'не проверялось' : blocked ? `не хватает: ${missing.length}` : 'все на месте',
      state: !found || !statusOk ? 'idle' : blocked ? 'fail' : 'ok' },
    { key: 'ncp', label: 'Открытые несоответствия',
      detail: !found ? '—' : summary.openNcp ? `${summary.openNcp} шт. · FOK не блокируют` : 'нет',
      state: !found ? 'idle' : summary.openNcp ? 'warn' : 'ok',
      action: found && summary.openNcp ? { label: 'К несоответствиям', run: () => onNavigate('ncp') } : undefined },
    { key: 'stations', label: 'Станции проверены',
      detail: !found ? '—' : summary.total ? `${summary.green} из ${summary.total} · FOK не блокируют` : 'нет данных',
      state: !found ? 'idle' : summary.total > 0 && summary.green === summary.total ? 'ok' : 'warn' },
  ];
  const CONDITION_ICON = { ok: '✓', fail: '✕', warn: '!', idle: '–' } as const;

  const signalType = !found ? 'idle' : blocked ? 'blocked' : eligible ? 'ready' : 'idle';
  const signalText = blocked
    ? `FOK заблокирован — ${message?.text ?? 'имеются неустановленные детали'}`
    : message ? message.text
    : !found ? 'Отсканируйте JobCard для проверки изделия'
    : eligible ? 'Изделие готово к подтверждению Final OK'
    : 'Проверьте доступность операции и статус изделия';

  return (
    <div className="app">
      <AppHeader screen="fok" onNavigate={onNavigate} session={session} onLogout={onLogout} />
      <div className="f7mes">
        <div className="f7mes__intro">
          <div className="f7mes__heading">
            <h1 className="f7mes__sr">FINAL OK — финальный контроль и подтверждение готовности изделия</h1>
            <img className="f7mes__title-img f7mes__title-img--light" src="/f7-final-ok-light.png" alt="" />
            <img className="f7mes__title-img f7mes__title-img--dark" src="/f7-final-ok-dark.png" alt="" />
          </div>
          <form className="f7mes__scan" onSubmit={onSubmit}>
            <span className="f7mes__scan-symbol" aria-hidden="true">▥</span>
            <div className="f7mes__scan-field">
              <label htmlFor={scanId}>ОТСКАНИРУЙТЕ ИЛИ ВВЕДИТЕ VIN</label>
              <input id={scanId} ref={inputRef} aria-label="Сканирование VIN" autoComplete="off" spellCheck={false}
                value={input} onChange={e => setInput(e.target.value)}
                placeholder="VIN / QR-код JobCard" disabled={busy} />
            </div>
          </form>
        </div>

        {/* Quality signal */}
        <div className="f7mes__signal" data-type={message?.kind === 'ok' ? 'ready' : signalType} role="status">
          <span className="f7mes__signal-icon" aria-hidden="true">{blocked || message?.kind === 'error' ? '⚠' : eligible || message?.kind === 'ok' ? '✓' : '▥'}</span>
          <span>{signalText}</span>
          {blocked && <button type="button" onClick={() => onNavigate('ncp')}>Открыть NCP →</button>}
        </div>

        <section className="f7mes__strip" aria-label="Очередь FOK">
          <div className="f7mes__strip-head"><h2>Очередь</h2><b>{pending.length}</b></div>
          <div className="f7mes__strip-list">
            {pending.length === 0 && <p className="f7mes__hint">Очередь пуста</p>}
            {pending.map((unit) => (
              <button type="button" key={unit.vin} className="f7mes__chip"
                data-selected={String(found?.vin === unit.vin)}
                aria-current={found?.vin === unit.vin ? 'true' : undefined}
                onClick={() => { setInput(''); void lookup(unit.vin); }}>
                <strong>{unit.vin}</strong>
                <small>{dash(unit.modelName)} · {dash(unit.color)}</small>
              </button>
            ))}
          </div>
        </section>

        <div className="f7mes__body">
          <section className="f7mes__panel f7mes__panel--cut f7mes__identity" aria-label={found ? `Найдено изделие ${found.vin}` : undefined}>
            <div className="f7mes__ident-head">
              <span className="f7mes__label">ТЕКУЩЕЕ ИЗДЕЛИЕ</span>
              <span className="f7mes__tag" data-type={blocked ? 'blocked' : eligible ? 'ready' : 'idle'}>
                {blocked ? 'FOK ЗАБЛОКИРОВАН' : eligible ? 'ГОТОВО К FOK' : 'ОЖИДАНИЕ'}
              </span>
            </div>
            <div className="f7mes__vin">{found?.vin ?? '—'}</div>
            <dl className="f7mes__spec">
              <div><dt>Модель</dt><dd>{dash(found?.modelName ?? null)}</dd></div>
              <div><dt>Цвет</dt><dd>{dash(found?.color ?? null)}</dd></div>
              <div><dt>Текущий статус</dt><dd>{found ? statusCodeLabel(found.statusId) : '—'}</dd></div>
            </dl>

            <ul className="f7mes__conds" aria-label="Условия FOK">
              {conditions.map((c) => (
                <li key={c.key} data-state={c.state}>
                  <span className="f7mes__cond-icon" aria-hidden="true">{CONDITION_ICON[c.state]}</span>
                  <span className="f7mes__cond-text"><strong>{c.label}</strong><small>{c.detail}</small></span>
                  {c.action && <button type="button" className="f7mes__cond-action" onClick={c.action.run}>{c.action.label}</button>}
                </li>
              ))}
            </ul>

            {missing.length > 0 && (
              <div className="f7mes__ncp-section">
                <div className="f7mes__ncp-title"><span>НЕУСТАНОВЛЕННЫЕ ДЕТАЛИ</span><span>{missing.length}</span></div>
                {missing.map(p => (
                  <div key={p.id} className="f7mes__ncp-item">
                    <div><strong>{p.componentName}</strong><small>{p.number} · {p.station}</small></div>
                    <b>{p.quantity} шт.</b>
                  </div>
                ))}
              </div>
            )}

            <div className="f7mes__actions">
              <button className="f7mes__btn f7mes__btn--secondary" type="button" onClick={reset}>Отмена</button>
              {blocked && found?.statusId === 2 && (
                <button className="f7mes__btn f7mes__btn--warn" type="button" disabled={busy}
                  onClick={() => void sendToRework(found.vin)}>Отправить в Rework</button>
              )}
              <button className="f7mes__btn f7mes__btn--accent f7mes__btn--grow" type="button"
                disabled={!eligible || busy} onClick={() => setShowModal(true)}>
                <span aria-hidden="true">✓ </span>Подтвердить FOK
              </button>
            </div>
          </section>

          <aside className="f7mes__twin-col" aria-label="Схема готовности">
            <ReadinessTwin stations={stations} states={twinStates}
              percent={doneKind === 'fok' ? 100 : found ? summary.percent : 0}
              green={doneKind === 'fok' ? summary.total : found ? summary.green : 0}
              total={summary.total} mode={twinMode}
              selected={selectedStation} onSelect={found ? setSelectedStation : undefined} />
            {found && selectedStation && (
              <StationDetailCard station={selectedStation}
                state={stationState(selectedStation, { components, checks, ncpItems })}
                components={components} checks={checks} ncpItems={ncpItems}
                onClose={() => setSelectedStation(null)} onOpenNcp={() => onNavigate('ncp')} />
            )}
          </aside>
        </div>

        {/* FOK confirmation modal */}
        {showModal && found && (
          <div className="f7mes__overlay" onClick={() => setShowModal(false)}>
            <div className="f7mes__modal" onClick={e => e.stopPropagation()}>
              <div className="f7mes__modal-header">
                <span className="f7mes__label">ПОДТВЕРЖДЕНИЕ</span>
                <button className="f7mes__modal-close" type="button" onClick={() => setShowModal(false)} aria-label="Закрыть">×</button>
              </div>
              <div className="f7mes__modal-body">
                <span className="f7mes__modal-icon" aria-hidden="true">✓</span>
                <h3>Подтвердить Final OK?</h3>
                <p>Изделие <strong>{found.vin}</strong> будет переведено в статус «{statusCodeLabel(3)}».</p>
                <p className="f7mes__modal-hint">Это действие нельзя отменить из этого экрана.</p>
              </div>
              <div className="f7mes__modal-actions">
                <button className="f7mes__btn f7mes__btn--secondary" type="button" onClick={() => setShowModal(false)}>Отмена</button>
                <button className="f7mes__btn f7mes__btn--accent" type="button" disabled={busy}
                  onClick={() => { setShowModal(false); void confirm(found.vin); }}>
                  ✓ Подтвердить FOK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
