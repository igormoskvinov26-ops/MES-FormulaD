import { useCallback, useEffect, useRef, useState } from 'react';
import type { Screen } from './AppHeader';
import { AppHeader } from './AppHeader';
import { ApiError, api, type ComponentItem, type NcpItem, type Paged } from './api';
import { NcpCreateDialog } from './NcpCreateDialog';
import { NcpDetails } from './NcpDetails';
import { NcpPrintDialog } from './NcpPrintDialog';
import { formatDate } from './format';

const PAGE_SIZE = 25;
const ALL = '__all__';

/** Загрузка страницы NCP — тот же приём, что usePlan в App.tsx: отбрасываем устаревшие ответы. */
function useNcpList(vin: string, status: string | null, page: number) {
  const [data, setData] = useState<Paged<NcpItem> | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const reload = useCallback(() => {
    const id = ++requestId.current;
    setState('loading');
    api
      .ncpList({ vin, status, page, pageSize: PAGE_SIZE })
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
  }, [vin, status, page]);

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
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<NcpItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [printItem, setPrintItem] = useState<NcpItem | null>(null);
  const [actionError, setActionError] = useState('');

  const [types, setTypes] = useState<string[]>([]);
  const [stations, setStations] = useState<string[]>([]);
  const [components, setComponents] = useState<ComponentItem[]>([]);

  const statusFilter = statusChoice === ALL ? null : statusChoice;
  const { data, state, error, reload } = useNcpList(vin.trim(), statusFilter, page);

  useEffect(() => {
    api.ncpTypes().then(setTypes).catch(() => setTypes([]));
    api.ncpStations().then(setStations).catch(() => setStations([]));
    api.ncpComponents().then(setComponents).catch(() => setComponents([]));
  }, []);

  // Выбранная заявка могла устареть после перезагрузки списка — обновляем её из свежих данных.
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
    <div className="app">
      <AppHeader screen="ncp" onNavigate={onNavigate} session={session} onLogout={onLogout} />

      <section className="toolbar">
        <div className="controls">
          <input
            className="search"
            aria-label="Поиск по VIN"
            placeholder="VIN целиком, начало или последние цифры"
            value={vin}
            maxLength={50}
            onChange={(event) => {
              setVin(event.target.value);
              setPage(1);
            }}
          />
          <select
            aria-label="Статус"
            value={statusChoice}
            onChange={(event) => {
              setStatusChoice(event.target.value);
              setPage(1);
            }}
          >
            <option value={ALL}>Все статусы</option>
            <option value="Открыто">Открыто</option>
            <option value="Закрыто">Закрыто</option>
          </select>
          <button type="button" className="primary" onClick={() => setShowCreate(true)}>
            Зарегистрировать несоответствие
          </button>
        </div>

        <div className="meta">
          <strong>{state === 'ready' && data ? `Заявок: ${data.total}` : 'Заявок: —'}</strong>
        </div>
      </section>

      <main className={selected ? 'content' : 'content content-wide'}>
        <div className="table-wrap">
          {state === 'loading' && <p className="muted">Загрузка…</p>}
          {state === 'error' && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {state === 'ready' && data && data.items.length === 0 && <p className="muted">Ничего не найдено</p>}
          {state === 'ready' && data && data.items.length > 0 && (
            <table>
              <caption className="sr-only">Несоответствия (демо-данные), новые сверху</caption>
              <thead>
                <tr>
                  <th scope="col">№</th>
                  <th scope="col">VIN</th>
                  <th scope="col">Станция</th>
                  <th scope="col">Компонент</th>
                  <th scope="col">Кол-во</th>
                  <th scope="col">Тип</th>
                  <th scope="col">Статус</th>
                  <th scope="col">Деталь</th>
                  <th scope="col">Создано</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr
                    key={item.id}
                    tabIndex={0}
                    className={selected?.id === item.id ? 'selected' : undefined}
                    aria-label={`Строка ${item.number}`}
                    onClick={() => setSelected(item)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') setSelected(item);
                    }}
                  >
                    <td className="mono">{item.number}</td>
                    <td className="mono vin">{item.vin}</td>
                    <td>{item.station}</td>
                    <td title={item.componentName}>{item.componentName}</td>
                    <td>{item.quantity}</td>
                    <td>{item.type}</td>
                    <td>
                      <span className={item.status === 'Закрыто' ? 'badge status-done' : 'badge status-progress'}>
                        {item.status}
                      </span>
                    </td>
                    <td>
                      {item.partInstalled ? (
                        <span className="badge status-ok">установлена</span>
                      ) : (
                        <span className="badge ncp-missing" title="Деталь не установлена">
                          не установлена
                        </span>
                      )}
                    </td>
                    <td>{formatDate(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {state === 'ready' && data && data.total > data.pageSize && (
            <nav className="pager" aria-label="Страницы">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Назад
              </button>
              <span>
                Страница {page} из {totalPages}
              </span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                Вперёд
              </button>
            </nav>
          )}
        </div>

        {selected && (
          <aside className="side">
            {actionError && (
              <p role="alert" className="error">
                {actionError}
              </p>
            )}
            <NcpDetails
              item={selected}
              onSetPartInstalled={(installed) => void setPartInstalled(selected.id, installed)}
              onClose={(comment) => void closeNcp(selected.id, comment)}
              onPrint={() => setPrintItem(selected)}
            />
          </aside>
        )}
      </main>

      {showCreate && (
        <NcpCreateDialog
          types={types}
          stations={stations}
          components={components}
          defaultVin=""
          onCreate={(input) => void createNcp(input)}
          onClose={() => setShowCreate(false)}
        />
      )}

      {printItem && <NcpPrintDialog mode="individual" item={printItem} onClose={() => setPrintItem(null)} />}
    </div>
  );
}
