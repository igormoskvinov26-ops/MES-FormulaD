import { useEffect, useRef, useState } from 'react';
import { usePlan } from './App';
import { api, type ProductionPlanItem } from './api';
import { dash, formatDate, statusBadge } from './format';
import { ProductCard } from './ProductCard';

const PAGE_SIZE = 25;
const ALL = '__all__';
const NO_STATUS = '__null__';

export function PlanScreen({
  session,
  onLogout,
}: {
  session: { userName: string | null; mode: string };
  onLogout: () => void;
}) {
  const [vin, setVin] = useState('');
  const [statusChoice, setStatusChoice] = useState(ALL);
  const [page, setPage] = useState(1);
  const [statuses, setStatuses] = useState<(string | null)[]>([]);
  const [selected, setSelected] = useState<ProductionPlanItem | null>(null);
  const [cardError, setCardError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const statusFilter = statusChoice === ALL ? null : statusChoice === NO_STATUS ? '' : statusChoice;
  const { data, state, error } = usePlan(vin.trim(), statusFilter, page, PAGE_SIZE);

  useEffect(() => {
    api.statuses().then(setStatuses).catch(() => setStatuses([]));
  }, []);

  // Ctrl/Cmd+K — фокус в поле VIN (сканер работает как клавиатура).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function openByVin(value: string) {
    setCardError('');
    try {
      setSelected(await api.byVin(value));
    } catch {
      setSelected(null);
      setCardError(`VIN ${value} не найден`);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="app">
      <header className="topbar">
        <strong>FormulaD MES 2.0</strong>
        <span className="badge badge-demo" title="Синтетические данные, не производственные">
          DEV • DEMO
        </span>
        <span className="spacer" />
        <span className="muted">{session.userName ?? 'неизвестно'}</span>
        <button
          type="button"
          onClick={async () => {
            await api.logout().catch(() => undefined);
            onLogout();
          }}
        >
          Выход
        </button>
      </header>

      <section className="toolbar">
        <div>
          <h1>Производственный план</h1>
          <p className="muted">
            {state === 'ready' && data ? `Всего: ${data.total} (демо)` : 'Всего: —'} · поиск по началу VIN, Enter при полном VIN открывает карточку
          </p>
        </div>
        <form
          className="controls"
          onSubmit={(event) => {
            event.preventDefault();
            const value = vin.trim();
            if (value) void openByVin(value);
          }}
        >
          <input
            ref={searchRef}
            aria-label="Поиск VIN или сканирование"
            placeholder="Поиск по началу VIN / сканирование"
            value={vin}
            maxLength={50}
            autoFocus
            onChange={(event) => {
              setVin(event.target.value);
              setPage(1);
            }}
          />
          <label className="sr-only" htmlFor="status">
            Статус
          </label>
          <select
            id="status"
            aria-label="Статус"
            value={statusChoice}
            onChange={(event) => {
              setStatusChoice(event.target.value);
              setPage(1);
            }}
          >
            <option value={ALL}>Все статусы</option>
            {statuses.map((status) => (
              <option key={status ?? NO_STATUS} value={status ?? NO_STATUS}>
                {status ?? 'Без статуса'}
              </option>
            ))}
          </select>
        </form>
      </section>

      <main className="content">
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
              <caption className="sr-only">Производственный план (демо-данные), сортировка по VIN</caption>
              <thead>
                <tr>
                  <th scope="col">VIN</th>
                  <th scope="col">Модель</th>
                  <th scope="col">Цвет</th>
                  <th scope="col">Статус</th>
                  <th scope="col">Начало сборки</th>
                  <th scope="col">Плановая отгрузка</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const badge = statusBadge(item.status);
                  return (
                    <tr
                      key={item.vin}
                      tabIndex={0}
                      aria-label={`Изделие ${item.vin}`}
                      onClick={() => void openByVin(item.vin)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void openByVin(item.vin);
                      }}
                    >
                      <td className="mono">{item.vin}</td>
                      <td>{dash(item.modelName)}</td>
                      <td>{dash(item.color)}</td>
                      <td>
                        <span className={`badge status-${badge.tone}`} title={badge.title}>
                          {badge.label}
                        </span>
                      </td>
                      <td>{formatDate(item.startDate)}</td>
                      <td>{formatDate(item.plannedShipmentDate)}</td>
                    </tr>
                  );
                })}
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

        <aside className="side">
          {cardError && (
            <p role="alert" className="error">
              {cardError}
            </p>
          )}
          {selected ? <ProductCard item={selected} /> : <p className="muted">Выберите изделие в таблице</p>}
        </aside>
      </main>
    </div>
  );
}
