import { useEffect, useRef, useState } from 'react';
import type { Screen } from './AppHeader';
import { AppHeader } from './AppHeader';
import { api, type ImportRawRow, type ImportSession, type PlanReference } from './api';
import { IMPORT_COLUMNS, parseDelimitedRows } from './importParse';

type TextField = 'vin' | 'engineNumber' | 'plannedStartDate' | 'plannedCompleteDate' | 'plannedShipmentDate';
type RefField = 'modelArticle' | 'color' | 'specificationName';

function buildUpdatedRow(current: ImportRawRow, field: keyof ImportRawRow, value: string): ImportRawRow {
  return { ...current, [field]: value || null };
}

/**
 * Импорт производственного плана (раздел 6 спецификации, Этап 8 плана). Два равноправных
 * способа ввода — файл (CSV) и вставка диапазона (раздел 6.1); парсинг общий
 * (см. importParse.ts), дальше оба способа ведут в один и тот же конвейер «временная область →
 * проверка → публикация», как и будущий вызов 1С (docs/INTEGRATION_1C.md).
 */
export function ImportScreen({
  session: authSession,
  onNavigate,
  onLogout,
}: {
  session: { userName: string | null; mode: string };
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
}) {
  const [reference, setReference] = useState<PlanReference | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [session, setSession] = useState<ImportSession | null>(null);
  const [stageError, setStageError] = useState('');
  const [busy, setBusy] = useState(false);
  const [publishedCount, setPublishedCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.planImportReference().then(setReference).catch(() => setReference(null));
  }, []);

  async function stage(rows: ImportRawRow[], source: string) {
    setStageError('');
    setPublishedCount(null);
    if (rows.length === 0) {
      setStageError('Не удалось распознать ни одной строки');
      return;
    }
    setBusy(true);
    try {
      setSession(await api.stageImport(rows, source));
    } catch {
      setStageError('Не удалось проверить загрузку — попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const text = await file.text();
    await stage(parseDelimitedRows(text), 'file');
  }

  function onPasteSubmit(event: React.FormEvent) {
    event.preventDefault();
    void stage(parseDelimitedRows(pasteText), 'paste');
  }

  function onCellChange(rowNumber: number, field: keyof ImportRawRow, value: string) {
    setSession((prev) =>
      prev && { ...prev, rows: prev.rows.map((r) => (r.rowNumber === rowNumber ? { ...r, row: buildUpdatedRow(r.row, field, value) } : r)) },
    );
  }

  async function commitRow(rowNumber: number, updatedRow: ImportRawRow) {
    if (!session) return;
    try {
      setSession(await api.replaceImportRow(session.id, rowNumber, updatedRow));
    } catch {
      setStageError('Не удалось повторно проверить строку');
    }
  }

  function onTextBlur(rowNumber: number, row: ImportRawRow) {
    void commitRow(rowNumber, row);
  }

  function onRefChange(rowNumber: number, row: ImportRawRow, field: RefField, value: string) {
    const updated = buildUpdatedRow(row, field, value);
    onCellChange(rowNumber, field, value);
    void commitRow(rowNumber, updated);
  }

  async function publish() {
    if (!session) return;
    setBusy(true);
    setStageError('');
    try {
      const result = await api.publishImport(session.id);
      setPublishedCount(result.published);
      setSession(null);
      setPasteText('');
    } catch {
      setStageError('Не удалось опубликовать загрузку — проверьте, что ошибок не осталось, и попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <AppHeader screen="import" onNavigate={onNavigate} session={authSession} onLogout={onLogout} />

      <section className="toolbar">
        <div>
          <h1>Импорт производственного плана</h1>
          <p className="muted">
            Столбцы: {IMPORT_COLUMNS.join(' · ')}. Первая строка — заголовки, пропускается.
          </p>
        </div>
        <div className="controls">
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            Выбрать файл (CSV)
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,.txt,.tsv" className="sr-only" onChange={(e) => void handleFile(e)} />
        </div>
      </section>

      {!session && (
        <main className="content content-wide">
          <form className="card" onSubmit={onPasteSubmit} style={{ maxWidth: 720 }}>
            <label>
              Вставка диапазона из Excel
              <textarea
                rows={8}
                placeholder={'Скопируйте диапазон ячеек в Excel и вставьте сюда (Ctrl+V)'}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button type="submit" className="primary" disabled={busy || pasteText.trim().length === 0}>
                {busy ? 'Проверка…' : 'Проверить'}
              </button>
            </div>
          </form>
        </main>
      )}

      {stageError && (
        <p role="alert" className="error" style={{ margin: '12px 18px 0' }}>
          {stageError}
        </p>
      )}

      {publishedCount !== null && (
        <p role="status" className="scan-banner scan-ok" style={{ margin: '12px 18px 0' }}>
          Добавлено изделий: {publishedCount}. Строки встали в конец очереди производственного плана.
        </p>
      )}

      {session && (
        <main className="content content-wide">
          <div className="table-wrap">
            <div className="toolbar">
              <strong>
                Строк: {session.totalCount} · Ошибок: {session.errorCount}
              </strong>
              <div className="controls">
                <button type="button" onClick={() => setSession(null)}>
                  Начать заново
                </button>
                <button type="button" className="primary" disabled={busy || session.errorCount > 0} onClick={() => void publish()}>
                  {busy ? 'Публикация…' : 'Загрузить производственный план'}
                </button>
              </div>
            </div>

            <table>
              <caption className="sr-only">Временная область импорта — строки с ошибками выделены</caption>
              <thead>
                <tr>
                  <th scope="col">№</th>
                  {IMPORT_COLUMNS.map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                  <th scope="col">Ошибки</th>
                </tr>
              </thead>
              <tbody>
                {session.rows.map((result) => {
                  const row = result.row;
                  return (
                    <tr key={result.rowNumber} className={result.errors.length > 0 ? 'import-row-error' : undefined}>
                      <td>{result.rowNumber}</td>
                      <td>
                        <input
                          aria-label={`Строка ${result.rowNumber}: VIN`}
                          value={row.vin ?? ''}
                          onChange={(e) => onCellChange(result.rowNumber, 'vin', e.target.value)}
                          onBlur={() => onTextBlur(result.rowNumber, row)}
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`Строка ${result.rowNumber}: артикул модели`}
                          value={reference?.models.some((m) => m.article === row.modelArticle) ? row.modelArticle ?? '' : ''}
                          onChange={(e) => onRefChange(result.rowNumber, row, 'modelArticle', e.target.value)}
                        >
                          <option value="">{row.modelArticle ? `— «${row.modelArticle}» —` : '— выбрать —'}</option>
                          {reference?.models.map((m) => (
                            <option key={m.article} value={m.article}>
                              {m.article} · {m.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          aria-label={`Строка ${result.rowNumber}: номер двигателя`}
                          value={row.engineNumber ?? ''}
                          onChange={(e) => onCellChange(result.rowNumber, 'engineNumber', e.target.value)}
                          onBlur={() => onTextBlur(result.rowNumber, row)}
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`Строка ${result.rowNumber}: цвет`}
                          value={reference?.colors.includes(row.color ?? '') ? row.color ?? '' : ''}
                          onChange={(e) => onRefChange(result.rowNumber, row, 'color', e.target.value)}
                        >
                          <option value="">{row.color ? `— «${row.color}» —` : '— выбрать —'}</option>
                          {reference?.colors.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          aria-label={`Строка ${result.rowNumber}: комплектация`}
                          value={reference?.specifications.includes(row.specificationName ?? '') ? row.specificationName ?? '' : ''}
                          onChange={(e) => onRefChange(result.rowNumber, row, 'specificationName', e.target.value)}
                        >
                          <option value="">{row.specificationName ? `— «${row.specificationName}» —` : '— выбрать —'}</option>
                          {reference?.specifications.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      {(['plannedStartDate', 'plannedCompleteDate', 'plannedShipmentDate'] as TextField[]).map((field) => (
                        <td key={field}>
                          <input
                            aria-label={`Строка ${result.rowNumber}: ${field}`}
                            placeholder="ГГГГ-ММ-ДД"
                            value={row[field] ?? ''}
                            onChange={(e) => onCellChange(result.rowNumber, field, e.target.value)}
                            onBlur={() => onTextBlur(result.rowNumber, row)}
                          />
                        </td>
                      ))}
                      <td>
                        {result.errors.length > 0 ? (
                          <ul className="import-errors">
                            {result.errors.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
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
        </main>
      )}
    </div>
  );
}
