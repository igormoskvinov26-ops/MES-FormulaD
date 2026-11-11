import { useEffect, useRef, useState } from 'react';
import type { Screen } from './AppHeader';
import { AppHeader } from './AppHeader';
import { api, type ImportRawRow, type ImportSession, type PlanReference } from './api';
import { IMPORT_COLUMNS, parseDelimitedRows } from './importParse';
import './f7-components.css';

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
  const [dragging, setDragging] = useState(false);
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

  async function readFile(file: File) {
    await stage(parseDelimitedRows(await file.text()), 'file');
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await readFile(file);
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file && !busy) void readFile(file);
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

  // Шаг конвейера «загрузка → проверка и исправление → публикация» (только подсказка, на логику не влияет).
  const currentStep = publishedCount !== null ? 3 : session ? (session.errorCount === 0 ? 2 : 1) : 0;
  const STEPS = ['Загрузка', 'Проверка и исправление', 'Публикация'];

  return (
    <div className="app f7plan">
      <AppHeader screen="import" onNavigate={onNavigate} session={authSession} onLogout={onLogout} />

      <div className="f7plan__title">
        <span className="f7mes__slash" aria-hidden="true" />
        <div>
          <h1>ИМПОРТ ПЛАНА</h1>
          <small>Производственный план из файла CSV или вставкой диапазона из Excel</small>
        </div>
      </div>

      <ol className="f7imp__steps" aria-label="Шаги импорта">
        {STEPS.map((label, i) => (
          <li key={label} data-state={i < currentStep ? 'done' : i === currentStep ? 'current' : 'todo'} aria-current={i === currentStep ? 'step' : undefined}>
            <b aria-hidden="true">{i < currentStep ? '✓' : i + 1}</b>
            <span>{label}</span>
          </li>
        ))}
      </ol>

      {stageError && (
        <p role="alert" className="error" style={{ margin: '12px 24px 0' }}>
          {stageError}
        </p>
      )}

      {publishedCount !== null && (
        <p role="status" className="scan-banner scan-ok f7imp__banner">
          Добавлено изделий: {publishedCount}. Строки встали в конец очереди производственного плана.
        </p>
      )}

      {!session && (
        <main className="f7imp__grid">
          <form className="f7imp__card" onSubmit={onPasteSubmit}>
            <h2>Вставка из Excel</h2>
            <textarea
              aria-label="Вставка диапазона из Excel"
              rows={10}
              placeholder={'Скопируйте диапазон ячеек в Excel и вставьте сюда (Ctrl+V)'}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <div className="modal-actions">
              <button type="submit" className="primary" disabled={busy || pasteText.trim().length === 0}>
                {busy ? 'Проверка…' : 'Проверить'}
              </button>
            </div>
          </form>

          <section
            className="f7imp__card f7imp__drop"
            data-drag={String(dragging)}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <h2>Файл CSV</h2>
            <div className="f7imp__dropzone">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 27V9M13 16l7-7 7 7M7 28v3a2 2 0 0 0 2 2h22a2 2 0 0 0 2-2v-3" />
              </svg>
              <p>Перетащите файл сюда</p>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                Выбрать файл (CSV)
              </button>
              <input ref={fileInputRef} type="file" accept=".csv,.txt,.tsv" className="sr-only" onChange={(e) => void handleFile(e)} />
            </div>
            <p className="f7imp__hint">Столбцы по порядку. Первая строка — заголовки, она пропускается.</p>
            <ul className="f7imp__cols" aria-label="Столбцы файла">
              {IMPORT_COLUMNS.map((label, i) => (
                <li key={label}><b>{i + 1}</b>{label}</li>
              ))}
            </ul>
          </section>
        </main>
      )}

      {session && (
        <main className="f7imp__result">
          <div className="f7imp__summary">
            <strong data-errors={String(session.errorCount > 0)}>
              Строк: {session.totalCount} · Ошибок: {session.errorCount}
            </strong>
            <span className="f7imp__verdict" data-ok={String(session.errorCount === 0)}>
              {session.errorCount === 0 ? 'Можно публиковать' : 'Исправьте ошибки — публикация недоступна'}
            </span>
            <div className="controls">
              <button type="button" onClick={() => setSession(null)}>
                Начать заново
              </button>
              <button type="button" className="primary" disabled={busy || session.errorCount > 0} onClick={() => void publish()}>
                {busy ? 'Публикация…' : 'Загрузить производственный план'}
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <caption className="sr-only">Временная область импорта — строки с ошибками выделены</caption>
              <thead>
                <tr>
                  <th scope="col">№</th>
                  <th scope="col">Проверка</th>
                  {IMPORT_COLUMNS.map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {session.rows.map((result) => {
                  const row = result.row;
                  return (
                    <tr key={result.rowNumber} className={result.errors.length > 0 ? 'import-row-error' : undefined}>
                      <td>{result.rowNumber}</td>
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
