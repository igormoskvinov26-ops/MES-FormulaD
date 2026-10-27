import { useEffect, useRef, useState } from 'react';
import { usePlan } from './App';
import { api, type ProductionPlanItem } from './api';
import { COLUMNS } from './columns';
import { ColumnPicker } from './ColumnPicker';
import { rowState } from './format';
import { ProductCard } from './ProductCard';
import { useColumnPrefs } from './useColumnPrefs';

const PAGE_SIZE = 25;
const ALL = '__all__';
const NO_STATUS = '__null__';

const LEGEND = [
  { key: 'waiting', label: 'В ожидании' },
  { key: 'in-work', label: 'В производстве' },
  { key: 'complete', label: 'Собрано' },
  { key: 'fok', label: 'ФОК пройден' },
];

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
  const { visible, toggle, reset } = useColumnPrefs();

  const statusFilter = statusChoice === ALL ? null : statusChoice === NO_STATUS ? '' : statusChoice;
  const { data, state, error } = usePlan(vin.trim(), statusFilter, page, PAGE_SIZE);
  const columns = COLUMNS.filter((c) => c.locked || visible.includes(c.key));

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
        <span className="logo" aria-label="FormulaD">
          F<span className="logo-mark">7</span>
        </span>
        <span className="topbar-title">Производственный план</span>
        <span className="badge badge-demo" title="Синтетические данные, не производственные">
          DEMO
        </span>
        <span className="spacer" />
        <span className="topbar-user">{session.userName ?? 'неизвестно'}</span>
        <button
          type="button"
          className="ghost"
          onClick={async () => {
            await api.logout().catch(() => undefined);
            onLogout();
          }}
        >
          Выход
        </button>
      </header>

      <section className="toolbar">
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
            className="search"
            aria-label="Поиск VIN или сканирование"
            placeholder="Сканируйте VIN или введите начало / последние цифры"
            value={vin}
            maxLength={50}
            autoFocus
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
            {statuses.map((status) => (
              <option key={status ?? NO_STATUS} value={status ?? NO_STATUS}>
                {status ?? 'Без статуса'}
              </option>
            ))}
          </select>
          <ColumnPicker visible={visible} onToggle={toggle} onReset={reset} />
        </form>

        <div className="meta">
          <strong>{state === 'ready' && data ? `Позиций: ${data.total}` : 'Позиций: —'}</strong>
          <ul className="legend">
            {LEGEND.map((entry) => (
              <li key={entry.key}>
                <i className={`swatch state-${entry.key}`} aria-hidden="true" />
                {entry.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Боковая панель появляется только когда есть что показать: иначе таблица занимает всю ширину. */}
      <main className={selected || cardError ? 'content' : 'content content-wide'}>
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
              <caption className="sr-only">Производственный план (демо-данные), сортировка по порядку запуска</caption>
              <thead>
                <tr>
                  <th scope="col">Состояние</th>
                  {columns.map((column) => (
                    <th key={column.key} scope="col">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const row = rowState(item);
                  return (
                    <tr
                      key={item.vin}
                      tabIndex={0}
                      className={selected?.vin === item.vin ? 'selected' : undefined}
                      aria-label={`Изделие ${item.vin}`}
                      onClick={() => void openByVin(item.vin)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void openByVin(item.vin);
                      }}
                    >
                      <td className="state-cell">
                        <i className={`swatch state-${row.key}`} aria-hidden="true" />
                        {row.label}
                      </td>
                      {columns.map((column) => {
                        const value = column.value(item);
                        return (
                          <td
                            key={column.key}
                            className={column.key === 'vin' ? 'mono vin' : undefined}
                            // Длинная «Комплектация» обрезается многоточием, полный текст — в подсказке и в карточке.
                            title={value}
                          >
                            {value}
                          </td>
                        );
                      })}
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

        {(selected || cardError) && (
          <aside className="side">
            {cardError && (
              <p role="alert" className="error">
                {cardError}
              </p>
            )}
            {selected && <ProductCard item={selected} />}
          </aside>
        )}
      </main>
    </div>
  );
}
