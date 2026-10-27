import { useEffect, useRef, useState } from 'react';
import { usePlan, usePlanCounts } from './App';
import type { Screen } from './AppHeader';
import { AppHeader } from './AppHeader';
import { api, type ProductionPlanItem } from './api';
import { MoveDialog } from './MoveDialog';
import { COLUMNS } from './columns';
import { ColumnPicker } from './ColumnPicker';
import { rowState, statusCodeLabel } from './format';
import { ProductCard } from './ProductCard';
import { useColumnPrefs } from './useColumnPrefs';
import { IconBolt, IconCheckBox, IconHourglass, IconLayers, IconShieldCheck } from './StatIcons';
import { JobCardDialog } from './JobCardDialog';
import { NcpPrintDialog } from './NcpPrintDialog';

const FIRST_BATCH_SIZE = 12;

/** Плашки под шапкой: статус → цвет (уже использован для бейджей и легенды строк) + значок. */
const COUNT_TILES: { statusId: 0 | 1 | 2 | 3; toneClass: string; Icon: typeof IconBolt }[] = [
  { statusId: 0, toneClass: 'state-waiting', Icon: IconHourglass },
  { statusId: 1, toneClass: 'state-in-work', Icon: IconBolt },
  { statusId: 2, toneClass: 'state-complete', Icon: IconCheckBox },
  { statusId: 3, toneClass: 'state-fok', Icon: IconShieldCheck },
];

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
  const [statuses, setStatuses] = useState<(string | null)[]>([]);
  const [selected, setSelected] = useState<ProductionPlanItem | null>(null);
  const [cardError, setCardError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const { visible, toggle, reset } = useColumnPrefs();
  const [editOrder, setEditOrder] = useState(false);
  const [activeVin, setActiveVin] = useState<string | null>(null);
  const [movedVin, setMovedVin] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<ProductionPlanItem | null>(null);
  const [moveError, setMoveError] = useState('');
  const [printSelection, setPrintSelection] = useState<Set<string>>(new Set());
  const [printError, setPrintError] = useState('');
  const [jobCardItems, setJobCardItems] = useState<ProductionPlanItem[] | null>(null);
  const [ncpSummaryVin, setNcpSummaryVin] = useState<string | null>(null);

  const statusFilter = statusChoice === ALL ? null : statusChoice === NO_STATUS ? '' : statusChoice;
  const { data, state, error, reload } = usePlan(vin.trim(), statusFilter, page, PAGE_SIZE);
  const columns = COLUMNS.filter((c) => c.locked || visible.includes(c.key));
  const counts = usePlanCounts();

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

  /** Перемещение на позицию соседней строки: шаг вверх или вниз. */
  async function step(item: ProductionPlanItem, direction: -1 | 1) {
    const rows = data?.items ?? [];
    const index = rows.findIndex((i) => i.vin === item.vin);
    const neighbour = rows[index + direction];
    if (!neighbour || neighbour.seqn === null || item.seqn === null) return;
    await move(item.vin, neighbour.seqn);
  }

  async function move(vinToMove: string, toPosition: number) {
    setMoveError('');
    try {
      await api.move(vinToMove, toPosition);
      setMoveTarget(null);
      // Выделение остаётся на перемещённом изделии, чтобы можно было нажать стрелку ещё раз.
      setActiveVin(vinToMove);
      setMovedVin(vinToMove);
      reload();
    } catch {
      setMoveError('Не удалось переместить изделие');
    }
  }

  async function openByVin(value: string) {
    setCardError('');
    try {
      setSelected(await api.byVin(value));
    } catch {
      setSelected(null);
      setCardError(`VIN ${value} не найден`);
    }
  }

  function togglePrintSelection(itemVin: string) {
    setPrintSelection((prev) => {
      const next = new Set(prev);
      if (next.has(itemVin)) next.delete(itemVin);
      else next.add(itemVin);
      return next;
    });
  }

  // Раздел 8: «первые 12 строк актуальной очереди» — очередь целиком, не только текущая
  // страница/фильтр, поэтому запрашиваем первую страницу плана заново, без фильтров.
  async function selectFirstBatch() {
    setPrintError('');
    try {
      const page1 = await api.plan({ page: 1, pageSize: FIRST_BATCH_SIZE });
      setPrintSelection(new Set(page1.items.map((item) => item.vin)));
    } catch {
      setPrintError('Не удалось получить очередь для выбора');
    }
  }

  async function printSelected() {
    setPrintError('');
    const vins = (data?.items ?? []).filter((item) => printSelection.has(item.vin));
    if (vins.length === printSelection.size) {
      setJobCardItems(vins);
      return;
    }
    // Часть выбранных VIN не на текущей странице/фильтре — подгружаем карточки по отдельности.
    try {
      const items = await Promise.all([...printSelection].map((v) => api.byVin(v)));
      setJobCardItems(items);
    } catch {
      setPrintError('Не удалось загрузить данные выбранных изделий');
    }
  }

  // Подсветка перемещённой строки гаснет сама.
  useEffect(() => {
    if (!movedVin) return;
    const timer = setTimeout(() => setMovedVin(null), 2500);
    return () => clearTimeout(timer);
  }, [movedVin]);

  // Alt+стрелки двигают выделенное изделие, F2 открывает перенос на позицию.
  useEffect(() => {
    if (!editOrder) return;
    function onKey(event: KeyboardEvent) {
      const rows = data?.items ?? [];
      const current = rows.find((i) => i.vin === activeVin);
      if (!current) return;
      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        void step(current, event.key === 'ArrowUp' ? -1 : 1);
      }
      if (event.key === 'F2') {
        event.preventDefault();
        setMoveTarget(current);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="app">
      <AppHeader screen="plan" onNavigate={onNavigate} session={session} onLogout={onLogout} />

      <section className="stat-tiles" aria-label="Сводка по статусам">
        <div className="stat-tile">
          <span className="stat-tile-icon">
            <IconLayers />
          </span>
          <div className="stat-tile-text">
            <strong>{counts ? counts.all : '—'}</strong>
            <span>Всего в плане</span>
          </div>
        </div>
        {COUNT_TILES.map((tile) => (
          <div key={tile.statusId} className="stat-tile">
            <span className={`stat-tile-icon ${tile.toneClass}`}>
              <tile.Icon />
            </span>
            <div className="stat-tile-text">
              <strong>{counts ? counts[tile.statusId] : '—'}</strong>
              <span>{statusCodeLabel(tile.statusId)}</span>
            </div>
          </div>
        ))}
      </section>

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
          <button
            type="button"
            className={editOrder ? 'primary' : undefined}
            aria-pressed={editOrder}
            onClick={() => {
              setEditOrder((v) => !v);
              setMoveError('');
            }}
          >
            {editOrder ? 'Готово' : 'Изменить порядок'}
          </button>
          <button type="button" onClick={() => void selectFirstBatch()}>
            Выбрать первые {FIRST_BATCH_SIZE}
          </button>
          <button type="button" disabled={printSelection.size === 0} onClick={() => void printSelected()}>
            Печать выбранных{printSelection.size > 0 ? ` (${printSelection.size})` : ''}
          </button>
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

      {printError && (
        <p role="alert" className="error" style={{ margin: '12px 18px 0' }}>
          {printError}
        </p>
      )}

      {/* Боковая панель появляется только когда есть что показать: иначе таблица занимает всю ширину. */}
      {editOrder && (
        <p className="edit-banner" role="status">
          Режим изменения порядка: стрелки ↑ ↓ в строке или <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd>,
          <kbd>F2</kbd> — перенос на позицию. Каждое перемещение сохраняется сразу.
          {moveError && <strong className="error"> {moveError}</strong>}
        </p>
      )}

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
                  <th scope="col">
                    <span className="sr-only">Выбор для печати</span>
                  </th>
                  {editOrder && <th scope="col">Перемещение</th>}
                  <th scope="col">Состояние</th>
                  {columns.map((column) => (
                    <th key={column.key} scope="col">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, index) => {
                  const row = rowState(item);
                  return (
                    <tr
                      key={item.vin}
                      tabIndex={0}
                      className={
                        [
                          activeVin === item.vin || selected?.vin === item.vin ? 'selected' : '',
                          movedVin === item.vin ? 'moved' : '',
                        ]
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                      aria-label={`Изделие ${item.vin}`}
                      onClick={() => {
                        setActiveVin(item.vin);
                        void openByVin(item.vin);
                      }}
                      onDoubleClick={() => setJobCardItems([item])}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void openByVin(item.vin);
                      }}
                    >
                      <td className="select-cell">
                        <input
                          type="checkbox"
                          aria-label={`Выбрать ${item.vin} для печати`}
                          checked={printSelection.has(item.vin)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => togglePrintSelection(item.vin)}
                        />
                      </td>
                      {editOrder && (
                        <td className="order-cell">
                          <button
                            type="button"
                            aria-label={`Переместить ${item.vin} вверх`}
                            disabled={item.seqn === null || index === 0}
                            onClick={(event) => {
                              event.stopPropagation();
                              setActiveVin(item.vin);
                              void step(item, -1);
                            }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            aria-label={`Переместить ${item.vin} вниз`}
                            disabled={item.seqn === null || index === (data?.items.length ?? 0) - 1}
                            onClick={(event) => {
                              event.stopPropagation();
                              setActiveVin(item.vin);
                              void step(item, 1);
                            }}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            aria-label={`Перенести ${item.vin} на позицию`}
                            disabled={item.seqn === null}
                            onClick={(event) => {
                              event.stopPropagation();
                              setActiveVin(item.vin);
                              setMoveTarget(item);
                            }}
                          >
                            №
                          </button>
                        </td>
                      )}
                      <td className="state-cell">
                        <span className={`state-badge state-${row.key}`}>
                          <i className="swatch" aria-hidden="true" />
                          {row.label}
                        </span>
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
            {selected && (
              <ProductCard
                item={selected}
                onPrint={() => setJobCardItems([selected])}
                onPrintNcpSummary={() => setNcpSummaryVin(selected.vin)}
              />
            )}
          </aside>
        )}
      </main>
      {moveTarget && (
        <MoveDialog
          item={moveTarget}
          items={data?.items ?? []}
          onMove={(toPosition) => void move(moveTarget.vin, toPosition)}
          onClose={() => setMoveTarget(null)}
        />
      )}
      {jobCardItems && <JobCardDialog items={jobCardItems} onClose={() => setJobCardItems(null)} />}
      {ncpSummaryVin && <NcpPrintDialog mode="summary" vin={ncpSummaryVin} onClose={() => setNcpSummaryVin(null)} />}
    </div>
  );
}
