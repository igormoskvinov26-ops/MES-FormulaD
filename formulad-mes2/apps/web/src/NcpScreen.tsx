import { useCallback, useEffect, useRef, useState } from 'react';
import type { Screen } from './AppHeader';
import { AppHeader } from './AppHeader';
import { ApiError, api, type ComponentItem, type NcpItem, type Paged } from './api';
import { NcpCreateDialog } from './NcpCreateDialog';
import { NcpDetails } from './NcpDetails';
import { NcpPrintDialog } from './NcpPrintDialog';
import { formatDate, pageList } from './format';
import { EmptyState } from './EmptyState';
import { TableSkeleton } from './Skeleton';
import './f7-components.css';

const PAGE_SIZE = 25;
const ALL = '__all__';

function useNcpList(vin: string, status: string | null, type: string | null, station: string | null, page: number) {
  const [data, setData] = useState<Paged<NcpItem> | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const reload = useCallback(() => {
    const id = ++requestId.current;
    setState('loading');
    api
      .ncpList({ vin, status, type, station, page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (id !== requestId.current) return;
        setData(result);
        setState('ready');
      })
      .catch((e: unknown) => {
        if (id !== requestId.current) return;
        setError(e instanceof ApiError && e.status === 401 ? 'Нет доступа' : 'Нет связи с сервером');
        setState('error');
      });
  }, [vin, status, type, station, page]);

  useEffect(reload, [reload]);

  return { data, state, error, reload };
}

export function NcpScreen({
  session,
  onNavigate,
  onLogout,
}: {
  session: { userName: string | null; mode: string };
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
}) {
  const [vin, setVin] = useState('');
  const [statusChoice, setStatusChoice] = useState(ALL);
  const [typeChoice, setTypeChoice] = useState(ALL);
  const [stationChoice, setStationChoice] = useState(ALL);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<NcpItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [printItem, setPrintItem] = useState<NcpItem | null>(null);
  const [actionError, setActionError] = useState('');

  const [types, setTypes] = useState<string[]>([]);
  const [stations, setStations] = useState<string[]>([]);
  const [components, setComponents] = useState<ComponentItem[]>([]);
  const [inWorkVins, setInWorkVins] = useState<string[]>([]);

  const statusFilter = statusChoice === ALL ? null : statusChoice;
  const typeFilter = typeChoice === ALL ? null : typeChoice;
  const stationFilter = stationChoice === ALL ? null : stationChoice;
  const { data, state, error, reload } = useNcpList(vin.trim(), statusFilter, typeFilter, stationFilter, page);

  useEffect(() => {
    api.ncpTypes().then(setTypes).catch(() => setTypes([]));
    api.ncpStations().then(setStations).catch(() => setStations([]));
    api.ncpComponents().then(setComponents).catch(() => setComponents([]));
    api.plan({ statusId: 1, page: 1, pageSize: 100 }).then((r) => setInWorkVins(r.items.map((i) => i.vin))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selected || !data) return;
    const fresh = data.items.find((i) => i.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [data, selected]);

  async function setPartInstalled(id: number, installed: boolean) {
    setActionError('');
    try {
      const updated = await api.ncpSetPartInstalled(id, installed);
      setSelected(updated);
      reload();
    } catch {
      setActionError('Не удалось обновить признак установки детали');
    }
  }

  async function closeNcp(id: number, engineerComment: string | null) {
    setActionError('');
    try {
      const updated = await api.ncpClose(id, engineerComment);
      setSelected(updated);
      reload();
    } catch {
      setActionError('Не удалось закрыть заявку');
    }
  }

  async function createNcp(input: Parameters<typeof api.ncpCreate>[0]) {
    setActionError('');
    try {
      const created = await api.ncpCreate(input);
      setShowCreate(false);
      setSelected(created);
      setPage(1);
      reload();
    } catch {
      setActionError('Не удалось зарегистрировать несоответствие — проверьте VIN и поля формы');
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="app f7plan">
      <AppHeader screen="ncp" onNavigate={onNavigate} session={session} onLogout={onLogout} />

      <div className="f7plan__title">
        <span className="f7mes__slash" aria-hidden="true" />
        <div>
          <h1>НЕСООТВЕТСТВИЯ / NCP</h1>
          <small>Регистрация, контроль установки детали и закрытие заявок</small>
        </div>
      </div>

      <section className="toolbar">
        <div className="controls">
          <span className="f7plan__filters-label">ФИЛЬТРЫ</span>
          <input
            className="search"
            aria-label="Поиск по VIN"
            placeholder="VIN целиком, начало или последние цифры"
            value={vin}
            maxLength={50}
            onChange={(event) => { setVin(event.target.value); setPage(1); }}
          />
          <select aria-label="Статус" value={statusChoice} onChange={(event) => { setStatusChoice(event.target.value); setPage(1); }}>
            <option value={ALL}>Все статусы</option>
            <option value="Открыто">Открыто</option>
            <option value="Закрыто">Закрыто</option>
          </select>
          <select aria-label="Тип несоответствия" value={typeChoice} onChange={(event) => { setTypeChoice(event.target.value); setPage(1); }}>
            <option value={ALL}>Все типы</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select aria-label="Станция" value={stationChoice} onChange={(event) => { setStationChoice(event.target.value); setPage(1); }}>
            <option value={ALL}>Все станции</option>
            {stations.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" className="primary" onClick={() => setShowCreate(true)}>Зарегистрировать несоответствие</button>
        </div>
        <div className="meta">
          <strong>{state === 'ready' && data ? `Заявок: ${data.total}` : 'Заявок: —'}</strong>
        </div>
      </section>

      <main className={selected ? 'content' : 'content content-wide'}>
        <div className="table-wrap">
          {state === 'loading' && <TableSkeleton />}
          {state === 'error' && <p role="alert" className="error">{error}</p>}
          {state === 'ready' && data && data.items.length === 0 && <EmptyState title="Ничего не найдено" hint="Измените фильтр или зарегистрируйте несоответствие" />}
          {state === 'ready' && data && data.items.length > 0 && (
            <table>
              <caption className="sr-only">Несоответствия (демо-данные), новые сверху</caption>
              <thead><tr><th>№</th><th>VIN</th><th>Станция</th><th>Компонент</th><th>Кол-во</th><th>Тип</th><th>Статус</th><th>Деталь</th><th>Создано</th></tr></thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} tabIndex={0}
                    className={[item.status === 'Закрыто' ? 'row-done' : 'row-ncp-open', selected?.id === item.id ? 'selected' : ''].filter(Boolean).join(' ')}
                    aria-label={`Строка ${item.number}`}
                    onClick={() => setSelected(item)}
                    onKeyDown={(event) => { if (event.key === 'Enter') setSelected(item); }}
                  >
                    <td className="mono">{item.number}</td>
                    <td className="mono vin">{item.vin}</td>
                    <td>{item.station}</td>
                    <td title={item.componentName}>{item.componentName}</td>
                    <td>{item.quantity}</td>
                    <td>{item.type}</td>
                    <td><span className={item.status === 'Закрыто' ? 'badge status-done' : 'badge status-progress'}>{item.status}</span></td>
                    <td>{item.partInstalled ? <span className="badge status-ok">установлена</span> : <span className="badge ncp-missing" title="Деталь не установлена">не установлена</span>}</td>
                    <td>{formatDate(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {state === 'ready' && data && data.total > data.pageSize && (
            <nav className="pager f7plan__pager" aria-label="Страницы">
              <span className="f7plan__shown">Показано {(page - 1) * data.pageSize + 1}–{Math.min(page * data.pageSize, data.total)} из {data.total}</span>
              <div className="f7plan__pages">
                <button type="button" aria-label="Назад" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>‹</button>
                {pageList(page, totalPages).map((p, i) => p === null ? <span key={`gap${i}`} className="f7plan__gap">…</span> : <button key={p} type="button" aria-label={`Страница ${p}`} aria-current={p === page ? 'page' : undefined} className={p === page ? 'is-current' : undefined} onClick={() => setPage(p)}>{p}</button>)}
                <button type="button" aria-label="Вперёд" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>›</button>
              </div>
            </nav>
          )}
        </div>
        {selected && (
          <aside className="side">
            {actionError && <p role="alert" className="error">{actionError}</p>}
            <NcpDetails item={selected} onSetPartInstalled={(installed) => void setPartInstalled(selected.id, installed)} onClose={(comment) => void closeNcp(selected.id, comment)} onPrint={() => setPrintItem(selected)} />
          </aside>
        )}
      </main>

      {showCreate && (
        <NcpCreateDialog types={types} stations={stations} components={components} defaultVin="" inWorkVins={inWorkVins} onCreate={(input) => void createNcp(input)} onClose={() => setShowCreate(false)} />
      )}
      {printItem && <NcpPrintDialog mode="individual" item={printItem} onClose={() => setPrintItem(null)} />}
    </div>
  );
}
