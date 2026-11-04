import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Screen } from './AppHeader';
import { AppHeader } from './AppHeader';
import { ApiError, api, type NcpItem, type ProductionPlanItem } from './api';
import { dash, statusCodeLabel } from './format';
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
  useEffect(() => { focusInput(); }, []);

  function focusInput() {
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function lookup(vin: string) {
    const id = ++requestId.current;
    setBusy(true);
    try {
      const item = await api.byVin(vin);
      if (id !== requestId.current) return;
      setFound(item);

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
      setFound(null); setMissing([]);
      setMessage({ kind: 'error', text: e instanceof ApiError && e.status === 404 ? `VIN ${vin} не найден` : 'Нет связи с сервером' });
    } finally {
      if (id === requestId.current) { setBusy(false); focusInput(); }
    }
  }

  async function confirm(vin: string) {
    setBusy(true);
    try {
      await api.fok(vin);
      setFound(null); setMissing([]);
      setMessage({ kind: 'ok', text: `Готово: ${vin} → «${statusCodeLabel(3)}»` });
      reloadPending();
    } catch {
      setFound(null); setMissing([]);
      setMessage({ kind: 'error', text: 'Не удалось выполнить переход — отсканируйте VIN ещё раз' });
    } finally { setBusy(false); setInput(''); focusInput(); }
  }

  async function sendToRework(vin: string) {
    setBusy(true);
    try {
      await api.sendToRework(vin);
      setFound(null); setMissing([]);
      setMessage({ kind: 'ok', text: `Готово: ${vin} → «${statusCodeLabel(4)}»` });
      reloadPending();
    } catch {
      setFound(null); setMissing([]);
      setMessage({ kind: 'error', text: 'Не удалось выполнить переход — отсканируйте VIN ещё раз' });
    } finally { setBusy(false); setInput(''); focusInput(); }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = input.trim();
    if (!v || busy) return;
    if (found && eligible && v.toLowerCase() === found.vin.toLowerCase()) {
      void confirm(found.vin);
    } else {
      void lookup(v);
      setInput('');
    }
  }

  function reset() { setFound(null); setMissing([]); setMessage(null); focusInput(); }

  // Route rail: stations from API + FOK step (reference format: СТ-01)
  const routeSteps = [
    ...stations.map((s, i) => ({
      id: `st-${i}`,
      number: i + 1,
      title: `СТ-${String(i + 1).padStart(2, '0')}`,
      state: 'done' as const,
    })),
    { id: 'fok', number: 'FOK', title: 'Контроль', state: 'current' as const },
  ];

  const signalType = !found ? 'idle' : blocked ? 'blocked' : eligible ? 'ready' : 'idle';
  const signalText = blocked
    ? 'FOK заблокирован — имеются неустановленные детали'
    : message?.kind === 'error' ? message.text
    : !found ? 'Отсканируйте JobCard для проверки изделия'
    : eligible ? 'Изделие готово к подтверждению Final OK'
    : 'Проверьте доступность операции и статус изделия';

  return (
    <div className="app">
      <AppHeader screen="fok" onNavigate={onNavigate} session={session} onLogout={onLogout} />
      <div className="f7mes">
        <div className="f7mes__intro">
          <div className="f7mes__heading">
            <span className="f7mes__slash" aria-hidden="true" />
            <div>
              <h1>FINAL OK</h1>
              <small>Финальный контроль и подтверждение готовности изделия</small>
            </div>
          </div>
          <form className="f7mes__scan" onSubmit={onSubmit}>
            <span className="f7mes__scan-symbol" aria-hidden="true">▥</span>
            <div className="f7mes__scan-field">
              <label htmlFor={scanId}>ОТСКАНИРУЙТЕ ИЛИ ВВЕДИТЕ VIN</label>
              <input id={scanId} ref={inputRef} autoComplete="off" spellCheck={false}
                value={input} onChange={e => setInput(e.target.value)}
                placeholder="VIN / QR-код JobCard" disabled={busy} />
            </div>
          </form>
        </div>

        {/* Quality signal */}
        <div className="f7mes__signal" data-type={signalType} role={blocked ? 'alert' : 'status'}>
          <span className="f7mes__signal-icon" aria-hidden="true">{blocked ? '⚠' : eligible ? '✓' : '▥'}</span>
          <span>{signalText}</span>
          {blocked && <button type="button" onClick={() => onNavigate('ncp')}>Открыть NCP →</button>}
        </div>

        {/* Success banner */}
        {message?.kind === 'ok' && (
          <div className="f7mes__signal" data-type="ready" role="status">
            <span className="f7mes__signal-icon" aria-hidden="true">✓</span>
            <span>{message.text}</span>
          </div>
        )}

        <div className="f7mes__body">
          {/* Left: identity panel */}
          <section className="f7mes__panel f7mes__panel--cut f7mes__identity">
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
              <button className="f7mes__btn f7mes__btn--accent" type="button"
                disabled={!eligible || busy} onClick={() => found && void confirm(found.vin)}>
                ✓ Подтвердить FOK
              </button>
            </div>
          </section>

          {/* Center: vehicle stage */}
          <div className="f7mes__stage">
            <div className="f7mes__vehicle-label"><strong>FORMULA 7 / ATV</strong><small>ENGINEERED FOR THE LINE</small></div>
            <svg viewBox="0 0 400 200" width="320" height="160" style={{ opacity: 0.15 }}>
              <text x="200" y="110" textAnchor="middle" fill="#fff" fontSize="48" fontFamily="Rajdhani, sans-serif" fontWeight="700">F7 ATV</text>
            </svg>
            <div className="f7mes__vehicle-footer"><span>MES / QC MONITOR</span></div>
          </div>

          {/* Right: queue */}
          <aside className="f7mes__panel f7mes__panel--cut f7mes__queue">
            <div className="f7mes__queue-head"><h2>Ожидают FOK</h2><b>{pending.length}</b></div>
            <div className="f7mes__queue-list">
              {pending.length === 0 && <p className="f7mes__hint">Нет ожидающих изделий</p>}
              {pending.map((unit, i) => (
                <button type="button" key={unit.vin} className="f7mes__queue-entry"
                  data-selected={String(found?.vin === unit.vin)}
                  onClick={() => { setInput(''); void lookup(unit.vin); }}>
                  <span className="f7mes__label">ИЗДЕЛИЕ {String(i + 1).padStart(2, '0')}</span>
                  <strong>{unit.vin}</strong>
                  <small>{dash(unit.modelName)} · {dash(unit.color)}</small>
                </button>
              ))}
            </div>
          </aside>
        </div>

        {/* Route rail */}
        {routeSteps.length > 1 && (
          <section className="f7mes__route">
            <div className="f7mes__route-heading">
              <h2>Сборочная линия / контрольные точки</h2>
              <span>Шаги и статусы передаются MES</span>
            </div>
            <div className="f7mes__route-steps">
              {routeSteps.map(step => (
                <div key={step.id} className="f7mes__route-step" data-state={step.state}>
                  <b>{step.number}</b><small>{step.title}</small>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
