import { useEffect, useState } from 'react';
import type { Screen } from './AppHeader';
import { AppHeader } from './AppHeader';
import { api, type Delivery, type DeliveryPackage, type PackingListRawRow, type PackingListSession, type SupplierRef } from './api';
import { DeliveryCreateDialog } from './DeliveryCreateDialog';
import { PackageDialog } from './PackageDialog';
import { PACKING_LIST_COLUMNS, parsePackingListRows } from './importParse';
import { formatDate } from './format';

const DELIVERY_STATUS_LABEL: Record<Delivery['status'], string> = {
  Open: 'В работе',
  Verified: 'Проверена',
  VerifiedWithIssues: 'Проверена, с замечаниями',
};

function buildUpdatedRow(current: PackingListRawRow, field: keyof PackingListRawRow, value: string): PackingListRawRow {
  return { ...current, [field]: value || null };
}

/** Список поставок + карточка одной поставки (раздел 19-24, Этап 9): Packing List вставляется
    тем же паттерном «вставка → проверка → исправление → подтверждение», что импорт плана
    (Этап 8), дальше — список коробок с проверкой по строкам в модальном окне. */
export function IncomingInspectionScreen({
  session: authSession,
  onNavigate,
  onLogout,
}: {
  session: { userName: string | null; mode: string };
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
}) {
  const [suppliers, setSuppliers] = useState<SupplierRef[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [listError, setListError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);

  const [pasteText, setPasteText] = useState('');
  const [plSession, setPlSession] = useState<PackingListSession | null>(null);
  const [stageError, setStageError] = useState('');
  const [busy, setBusy] = useState(false);

  const [scanHu, setScanHu] = useState('');
  const [scanError, setScanError] = useState('');
  const [openPackage, setOpenPackage] = useState<DeliveryPackage | null>(null);

  function reloadDeliveries() {
    api.deliveries().then((p) => setDeliveries(p.items)).catch(() => setListError('Нет связи с сервером'));
  }

  useEffect(() => {
    api.suppliers().then(setSuppliers).catch(() => setSuppliers([]));
    reloadDeliveries();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDelivery(null);
      reloadDeliveries(); // список мог устареть — коробки/статус поставки менялись на экране карточки
      return;
    }
    api.delivery(selectedId).then(setDelivery).catch(() => setDelivery(null));
  }, [selectedId]);

  async function createDelivery(data: { supplierCode: string; invoiceNumber: string; invoiceDate: string; accompanyingDocument: string | null }) {
    setCreateError('');
    try {
      const created = await api.createDelivery(data.supplierCode, data.invoiceNumber, data.invoiceDate, data.accompanyingDocument);
      setShowCreate(false);
      reloadDeliveries();
      setSelectedId(created.id);
    } catch {
      setCreateError('Не удалось создать поставку');
    }
  }

  async function stage(rows: PackingListRawRow[]) {
    if (!delivery) return;
    setStageError('');
    if (rows.length === 0) {
      setStageError('Не удалось распознать ни одной строки');
      return;
    }
    setBusy(true);
    try {
      setPlSession(await api.stagePackingList(delivery.id, rows));
    } catch {
      setStageError('Не удалось проверить загрузку — попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  function onCellChange(rowNumber: number, field: keyof PackingListRawRow, value: string) {
    setPlSession((prev) =>
      prev && { ...prev, rows: prev.rows.map((r) => (r.rowNumber === rowNumber ? { ...r, row: buildUpdatedRow(r.row, field, value) } : r)) },
    );
  }

  async function commitRow(rowNumber: number, updatedRow: PackingListRawRow) {
    if (!plSession) return;
    try {
      setPlSession(await api.replacePackingListRow(plSession.id, rowNumber, updatedRow));
    } catch {
      setStageError('Не удалось повторно проверить строку');
    }
  }

  async function addUnknownArticle(rowNumber: number, row: PackingListRawRow) {
    const name = window.prompt(`Наименование для артикула «${row.article}»`, row.componentName ?? '');
    if (!name || !name.trim()) return;
    try {
      await api.addComponent(row.article!.trim(), name.trim());
      await commitRow(rowNumber, row);
    } catch {
      setStageError('Не удалось добавить артикул в справочник');
    }
  }

  async function confirm() {
    if (!plSession) return;
    setBusy(true);
    setStageError('');
    try {
      const updated = await api.confirmPackingList(plSession.id);
      setDelivery(updated);
      setPlSession(null);
      setPasteText('');
    } catch {
      setStageError('Не удалось подтвердить загрузку — проверьте, что ошибок не осталось');
    } finally {
      setBusy(false);
    }
  }

  async function onScan(event: React.FormEvent) {
    event.preventDefault();
    if (!delivery || !scanHu.trim()) return;
    setScanError('');
    try {
      setOpenPackage(await api.packageByHu(delivery.id, scanHu.trim()));
      setScanHu('');
    } catch {
      setScanError('Коробка не найдена в этой поставке');
    }
  }

  function onPackageChanged(updated: DeliveryPackage) {
    setOpenPackage(updated);
    // Делаем локальный патч для мгновенного отклика в таблице коробок, но Delivery.status
    // вычисляется на сервере (раздел 23: «проверена» ровно когда закрыты все коробки) — после
    // close/reopen локальная правка одних Packages его не обновит, поэтому догружаем поставку.
    setDelivery((prev) => prev && { ...prev, packages: prev.packages.map((p) => (p.id === updated.id ? updated : p)) });
    if (delivery) {
      api.delivery(delivery.id).then(setDelivery).catch(() => undefined);
    }
  }

  // --- Список поставок --------------------------------------------------
  if (!delivery) {
    return (
      <div className="app">
        <AppHeader screen="incoming" onNavigate={onNavigate} session={authSession} onLogout={onLogout} />
        <section className="toolbar">
          <h1>Входной контроль</h1>
          <div className="controls">
            <button type="button" className="primary" onClick={() => setShowCreate(true)}>
              Новая поставка
            </button>
          </div>
        </section>

        {listError && <p role="alert" className="error" style={{ margin: '12px 18px 0' }}>{listError}</p>}

        <main className="content content-wide">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Поставщик</th>
                  <th scope="col">Инвойс</th>
                  <th scope="col">Дата</th>
                  <th scope="col">Коробок</th>
                  <th scope="col">Статус</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} onClick={() => setSelectedId(d.id)} style={{ cursor: 'pointer' }}>
                    <td>{d.supplierName}</td>
                    <td>{d.invoiceNumber}</td>
                    <td>{formatDate(d.invoiceDate)}</td>
                    <td>{d.packages.length}</td>
                    <td>
                      <span className={d.status === 'VerifiedWithIssues' ? 'badge badge-warn' : d.status === 'Verified' ? 'badge badge-ok' : 'badge'}>
                        {DELIVERY_STATUS_LABEL[d.status]}
                      </span>
                    </td>
                  </tr>
                ))}
                {deliveries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="center muted">
                      Поставок пока нет
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </main>

        {showCreate && (
          <DeliveryCreateDialog suppliers={suppliers} onCreate={(d) => void createDelivery(d)} onClose={() => setShowCreate(false)} />
        )}
        {createError && <p role="alert" className="error" style={{ margin: '12px 18px' }}>{createError}</p>}
      </div>
    );
  }

  // --- Карточка поставки --------------------------------------------------
  return (
    <div className="app">
      <AppHeader screen="incoming" onNavigate={onNavigate} session={authSession} onLogout={onLogout} />
      <section className="toolbar">
        <div>
          <h1>
            {delivery.supplierName} · Инвойс {delivery.invoiceNumber}
          </h1>
          <p className="muted">
            {formatDate(delivery.invoiceDate)} ·{' '}
            <span className={delivery.status === 'VerifiedWithIssues' ? 'badge badge-warn' : delivery.status === 'Verified' ? 'badge badge-ok' : 'badge'}>
              {DELIVERY_STATUS_LABEL[delivery.status]}
            </span>
          </p>
        </div>
        <div className="controls">
          <button type="button" onClick={() => setSelectedId(null)}>
            ← К списку поставок
          </button>
        </div>
      </section>

      <main className="content content-wide">
        {!plSession && (
          <form
            className="card"
            style={{ maxWidth: 720 }}
            onSubmit={(e) => {
              e.preventDefault();
              void stage(parsePackingListRows(pasteText));
            }}
          >
            <label>
              Вставка Packing List из Excel ({PACKING_LIST_COLUMNS.join(' · ')})
              <textarea rows={6} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Ctrl+V диапазон ячеек" />
            </label>
            <div className="modal-actions">
              <button type="submit" className="primary" disabled={busy || pasteText.trim().length === 0}>
                {busy ? 'Проверка…' : 'Проверить'}
              </button>
            </div>
          </form>
        )}

        {stageError && (
          <p role="alert" className="error" style={{ margin: '12px 0' }}>
            {stageError}
          </p>
        )}

        {plSession && (
          <div className="table-wrap">
            <div className="toolbar">
              <strong>
                Строк: {plSession.totalCount} · Ошибок: {plSession.errorCount}
              </strong>
              <div className="controls">
                <button type="button" onClick={() => setPlSession(null)}>
                  Начать заново
                </button>
                <button type="button" className="primary" disabled={busy || plSession.errorCount > 0} onClick={() => void confirm()}>
                  {busy ? 'Подтверждение…' : 'Добавить в поставку'}
                </button>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th scope="col">№</th>
                  {PACKING_LIST_COLUMNS.map((c) => (
                    <th key={c} scope="col">{c}</th>
                  ))}
                  <th scope="col">Ошибки</th>
                </tr>
              </thead>
              <tbody>
                {plSession.rows.map((result) => {
                  const row = result.row;
                  const unknownArticle = result.errors.some((e) => e.includes('не найден в справочнике'));
                  return (
                    <tr key={result.rowNumber} className={result.errors.length > 0 ? 'import-row-error' : undefined}>
                      <td>{result.rowNumber}</td>
                      <td>
                        <input
                          aria-label={`Строка ${result.rowNumber}: HU`}
                          value={row.packageNumber ?? ''}
                          onChange={(e) => onCellChange(result.rowNumber, 'packageNumber', e.target.value)}
                          onBlur={() => void commitRow(result.rowNumber, row)}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Строка ${result.rowNumber}: артикул`}
                          value={row.article ?? ''}
                          onChange={(e) => onCellChange(result.rowNumber, 'article', e.target.value)}
                          onBlur={() => void commitRow(result.rowNumber, row)}
                        />
                      </td>
                      <td>{row.componentName ?? '—'}</td>
                      <td>
                        <input
                          aria-label={`Строка ${result.rowNumber}: количество`}
                          value={row.quantity ?? ''}
                          onChange={(e) => onCellChange(result.rowNumber, 'quantity', e.target.value)}
                          onBlur={() => void commitRow(result.rowNumber, row)}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Строка ${result.rowNumber}: вес нетто`}
                          value={row.netWeight ?? ''}
                          onChange={(e) => onCellChange(result.rowNumber, 'netWeight', e.target.value)}
                          onBlur={() => void commitRow(result.rowNumber, row)}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Строка ${result.rowNumber}: вес брутто`}
                          value={row.grossWeight ?? ''}
                          onChange={(e) => onCellChange(result.rowNumber, 'grossWeight', e.target.value)}
                          onBlur={() => void commitRow(result.rowNumber, row)}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Строка ${result.rowNumber}: партия`}
                          value={row.batch ?? ''}
                          onChange={(e) => onCellChange(result.rowNumber, 'batch', e.target.value)}
                          onBlur={() => void commitRow(result.rowNumber, row)}
                        />
                      </td>
                      <td>
                        {result.errors.length > 0 ? (
                          <>
                            <ul className="import-errors">
                              {result.errors.map((e) => (
                                <li key={e}>{e}</li>
                              ))}
                            </ul>
                            {unknownArticle && (
                              <button type="button" onClick={() => void addUnknownArticle(result.rowNumber, row)}>
                                Добавить «{row.article}» в справочник
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="badge status-ok">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <h2>Коробки</h2>
        <form className="controls" onSubmit={(e) => void onScan(e)} style={{ marginBottom: 12 }}>
          <input aria-label="Сканирование HU" placeholder="Скан HU или номер коробки" value={scanHu} onChange={(e) => setScanHu(e.target.value)} />
          <button type="submit">Открыть</button>
        </form>
        {scanError && (
          <p role="alert" className="error">
            {scanError}
          </p>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">HU</th>
                <th scope="col">Строк</th>
                <th scope="col">Статус</th>
                <th scope="col">Закрыта</th>
              </tr>
            </thead>
            <tbody>
              {delivery.packages.map((p) => (
                <tr key={p.id} onClick={() => setOpenPackage(p)} style={{ cursor: 'pointer' }}>
                  <td>{p.huNumber}</td>
                  <td>{p.rows.length}</td>
                  <td>
                    <span className={p.status === 'Closed' ? (p.hasIssues ? 'badge badge-warn' : 'badge badge-ok') : 'badge'}>
                      {p.status === 'Closed' ? (p.hasIssues ? 'Проверено, с замечаниями' : 'Проверено') : 'Открыта'}
                    </span>
                  </td>
                  <td>{formatDate(p.closedAt)}</td>
                </tr>
              ))}
              {delivery.packages.length === 0 && (
                <tr>
                  <td colSpan={4} className="center muted">
                    Коробок пока нет — вставьте Packing List выше
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {openPackage && <PackageDialog pkg={openPackage} onChanged={onPackageChanged} onClose={() => setOpenPackage(null)} />}
    </div>
  );
}
