import { useRef, useState } from 'react';
import { api, type DeliveryPackage } from './api';

const OUTCOMES = ['OK', 'Брак', 'Пересорт', 'Недостача'];

/** Строка проверки внутри коробки (раздел 21): количество + результат — общий механизм и для
    скана (OK, по 1 шт. за раз), и для ручного ввода (любое количество сразу, обязательно для
    брака/пересорта/недостачи — раздел 21, [С]: «результат можно указать вручную»). */
function RowControls({
  packageId,
  row,
  closed,
  onChanged,
}: {
  packageId: number;
  row: DeliveryPackage['rows'][number];
  closed: boolean;
  onChanged: (updated: DeliveryPackage) => void;
}) {
  const [outcome, setOutcome] = useState('OK');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [quotaValue, setQuotaValue] = useState(String(row.plannedQuantity));
  const [quotaComment, setQuotaComment] = useState('');
  const [quotaError, setQuotaError] = useState('');

  const remaining = row.requiredQuantity - row.checkedQuantity;

  async function record() {
    setError('');
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      setError('Количество должно быть положительным целым числом');
      return;
    }
    if (outcome !== 'OK' && reason.trim().length === 0) {
      setError('Укажите причину');
      return;
    }
    setBusy(true);
    try {
      const updated = await api.recordRowResult(packageId, row.id, outcome, qty, outcome === 'OK' ? null : reason.trim());
      onChanged(updated);
      setQuantity('1');
      setReason('');
    } catch {
      setError('Не удалось записать результат — проверьте, что количество не превышает требуемый объём');
    } finally {
      setBusy(false);
    }
  }

  async function increaseQuota() {
    setQuotaError('');
    const value = Number(quotaValue);
    if (!Number.isInteger(value) || value <= row.requiredQuantity || value > row.plannedQuantity) {
      setQuotaError(`Новый объём должен быть больше ${row.requiredQuantity} и не больше ${row.plannedQuantity}`);
      return;
    }
    if (quotaComment.trim().length === 0) {
      setQuotaError('Комментарий обязателен');
      return;
    }
    setBusy(true);
    try {
      const updated = await api.increaseQuota(packageId, row.id, value, quotaComment.trim());
      onChanged(updated);
      setQuotaOpen(false);
      setQuotaComment('');
    } catch {
      setQuotaError('Не удалось увеличить норматив');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pkg-row-controls">
      {!closed && remaining > 0 && (
        <div className="pkg-row-action">
          <select aria-label={`Строка ${row.componentCode}: результат`} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={remaining}
            aria-label={`Строка ${row.componentCode}: количество`}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          {outcome !== 'OK' && (
            <input
              placeholder="Причина"
              aria-label={`Строка ${row.componentCode}: причина`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
          <button type="button" disabled={busy} onClick={() => void record()}>
            Записать
          </button>
          <button type="button" className="ghost" disabled={busy} onClick={() => setQuotaOpen((v) => !v)}>
            Увеличить объём
          </button>
        </div>
      )}
      {error && <p role="alert" className="error pkg-row-error">{error}</p>}
      {quotaOpen && (
        <div className="pkg-row-action">
          <input
            type="number"
            aria-label={`Строка ${row.componentCode}: новый объём`}
            value={quotaValue}
            onChange={(e) => setQuotaValue(e.target.value)}
          />
          <input
            placeholder="Комментарий (обязательно)"
            aria-label={`Строка ${row.componentCode}: комментарий к увеличению`}
            value={quotaComment}
            onChange={(e) => setQuotaComment(e.target.value)}
          />
          <button type="button" disabled={busy} onClick={() => void increaseQuota()}>
            Подтвердить
          </button>
        </div>
      )}
      {quotaError && <p role="alert" className="error pkg-row-error">{quotaError}</p>}
    </div>
  );
}

/**
 * Коробка (раздел 20-23): список строк с текущим прогрессом проверки, запись результата по
 * строке, увеличение норматива, закрытие — отдельное явное действие (раздел 23, [С]), доступное
 * только когда каждая строка отработана по своему нормативу (включая признанную недостачу).
 */
export function PackageDialog({ pkg, onChanged, onClose }: { pkg: DeliveryPackage; onChanged: (updated: DeliveryPackage) => void; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [reopenComment, setReopenComment] = useState('');
  const [reopenError, setReopenError] = useState('');
  const [reopening, setReopening] = useState(false);
  const [scanValue, setScanValue] = useState('');
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  // T-171: two-scan flow — первый скан выделяет жёлтым, второй подтверждает OK.
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const closed = pkg.status === 'Closed';

  async function confirmScan(code: string) {
    const row = pkg.rows.find((r) => r.componentCode.toLowerCase() === code.toLowerCase());
    if (!row) return;
    setScanBusy(true);
    try {
      onChanged(await api.recordRowResult(pkg.id, row.id, 'OK', 1, null));
      setScanMsg({ ok: true, text: `${code}: +1 OK` });
      setPendingCode(null);
    } catch {
      setScanMsg({ ok: false, text: 'Не удалось записать — превышен норматив?' });
    } finally {
      setScanBusy(false);
      requestAnimationFrame(() => scanRef.current?.focus());
    }
  }

  async function scanRecord(code: string) {
    const row = pkg.rows.find((r) => r.componentCode.toLowerCase() === code.toLowerCase());
    if (!row) {
      setScanMsg({ ok: false, text: `Артикул «${code}» не найден в коробке` });
      setPendingCode(null);
      return;
    }
    if (row.isComplete) { setScanMsg({ ok: false, text: `Строка ${code} уже отработана` }); return; }
    // Second scan of same code → confirm OK
    if (pendingCode !== null && pendingCode.toLowerCase() === code.toLowerCase()) {
      void confirmScan(code);
      return;
    }
    // First scan → highlight yellow
    setPendingCode(row.componentCode);
    setScanMsg({ ok: true, text: `Найдено: «${code}» — отсканируйте ещё раз для подтверждения` });
  }

  function onScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = scanValue.trim();
    if (!code || scanBusy) return;
    setScanValue('');
    void scanRecord(code);
  }

  async function close() {
    setCloseError('');
    setClosing(true);
    try {
      onChanged(await api.closePackage(pkg.id));
    } catch {
      setCloseError('Не все строки отработаны по требуемому нормативу');
    } finally {
      setClosing(false);
    }
  }

  async function reopen() {
    setReopenError('');
    if (reopenComment.trim().length === 0) {
      setReopenError('Комментарий обязателен');
      return;
    }
    setReopening(true);
    try {
      onChanged(await api.reopenPackage(pkg.id, reopenComment.trim()));
      setReopenComment('');
    } catch {
      setReopenError('Не удалось переоткрыть коробку');
    } finally {
      setReopening(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal pkg-modal" role="dialog" aria-modal="true" aria-label={`Коробка ${pkg.huNumber}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-actions">
          <div>
            <h2>
              Коробка {pkg.huNumber}{' '}
              <span className={closed ? (pkg.hasIssues ? 'badge badge-warn' : 'badge badge-ok') : 'badge'}>
                {closed ? (pkg.hasIssues ? 'Проверено, с замечаниями' : 'Проверено') : 'Открыта'}
              </span>
            </h2>
            <div className="pkg-progress">
              <span>Строк: {pkg.rows.length}</span>
              <span>·</span>
              <span>Отработано: {pkg.rows.filter((r) => r.isComplete).length} из {pkg.rows.length}</span>
            </div>
          </div>
          <button type="button" onClick={onClose}>
            Закрыть окно
          </button>
        </div>

        {!closed && (
          <form className="pkg-scan-bar" onSubmit={onScanSubmit}>
            <input
              ref={scanRef}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder="Сканировать артикул (+1 OK)…"
              aria-label="Сканировать штрих-код артикула"
              value={scanValue}
              disabled={scanBusy}
              onChange={(e) => setScanValue(e.target.value)}
            />
            {scanMsg && (
              <span role="status" className={scanMsg.ok ? 'scan-ok' : 'scan-bad'}>{scanMsg.text}</span>
            )}
          </form>
        )}

        <table>
          <thead>
            <tr>
              <th scope="col">Артикул</th>
              <th scope="col">Партия</th>
              <th scope="col">Нетто, кг</th>
              <th scope="col">Брутто, кг</th>
              <th scope="col">Поступило</th>
              <th scope="col">Норматив</th>
              <th scope="col">OK</th>
              <th scope="col">Брак</th>
              <th scope="col">Пересорт</th>
              <th scope="col">Недостача</th>
              <th scope="col">Статус</th>
            </tr>
          </thead>
          <tbody>
            {pkg.rows.map((row) => {
              const isPending = pendingCode !== null && row.componentCode.toLowerCase() === pendingCode.toLowerCase();
              return (
              <tr key={row.id} className={isPending ? 'pkg-row-pending' : (row.hasIssues ? 'import-row-error' : undefined)}>
                <td>
                  {row.componentName} <span className="muted">({row.componentCode})</span>
                  {isPending && (
                    <button type="button" className="primary" disabled={scanBusy}
                      onClick={() => void confirmScan(row.componentCode)}
                      aria-label={`Подтвердить OK для ${row.componentCode}`}>
                      ✓ OK
                    </button>
                  )}
                  {!isPending && <RowControls packageId={pkg.id} row={row} closed={closed} onChanged={onChanged} />}
                </td>
                <td>{row.batch ?? '—'}</td>
                <td>{row.netWeight != null ? row.netWeight : '—'}</td>
                <td>{row.grossWeight != null ? row.grossWeight : '—'}</td>
                <td>{row.plannedQuantity}</td>
                <td>{row.requiredQuantity}</td>
                <td>{row.okQuantity}</td>
                <td>{row.defectQuantity}</td>
                <td>{row.mismatchQuantity}</td>
                <td>{row.shortageQuantity}</td>
                <td>
                  <span className={row.isComplete ? 'badge status-ok' : 'badge'}>
                    {row.isComplete ? 'Отработано' : `Осталось ${row.requiredQuantity - row.checkedQuantity}`}
                  </span>
                  {row.requiredQuantity > 0 && (
                    <div className="progress-bar">
                      <div
                        className={`progress-bar-fill${row.isComplete ? ' complete' : ''}${row.hasIssues ? ' has-issues' : ''}`}
                        style={{ width: `${Math.min(100, (row.checkedQuantity / row.requiredQuantity) * 100)}%` }}
                      />
                    </div>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>

        {!closed && (
          <div className="modal-actions">
            {closeError && (
              <p role="alert" className="error">
                {closeError}
              </p>
            )}
            <button type="button" className="primary" disabled={closing || !pkg.isComplete} onClick={() => void close()}>
              Проверка завершена — закрыть коробку
            </button>
          </div>
        )}

        {closed && (
          <div className="modal-actions">
            <input
              placeholder="Комментарий к переоткрытию (обязательно)"
              aria-label="Комментарий к переоткрытию"
              value={reopenComment}
              onChange={(e) => setReopenComment(e.target.value)}
            />
            <button type="button" disabled={reopening} onClick={() => void reopen()}>
              Переоткрыть коробку
            </button>
            {reopenError && (
              <p role="alert" className="error">
                {reopenError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
