import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api, type CalendarDayChange, type CalendarSettings, type CalendarState } from './api';
import { WEEKDAYS_SHORT, isoWeekday } from './calendar';
import { parseCalendarImport, parseDate, type CalendarImportResult } from './calendarImport';
import { takt, validateSettings, workMinutes } from './calendarSettings';

const ruDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const kindLabel = (kind: 'off' | 'work', from: string | null) => (kind === 'off' ? 'Выходной / праздник' : from ? 'Рабочий, особые часы' : 'Рабочий (перенос)');
const CHUNK = 400;

export function CalendarAdmin() {
  const [state, setState] = useState<CalendarState | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<CalendarImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<CalendarSettings | null>(null);
  const [stations, setStations] = useState<string[]>([]);

  const [newDate, setNewDate] = useState('');
  const [newKind, setNewKind] = useState<'off' | 'work'>('off');
  const [newFrom, setNewFrom] = useState('');
  const [newTo, setNewTo] = useState('');
  const [newNote, setNewNote] = useState('');

  useEffect(() => {
    api.calendar().then((s) => { setState(s); setDraft(s.settings); }).catch(() => setError('Не удалось загрузить календарь'));
  }, []);

  useEffect(() => {
    api.ncpStations().then(setStations).catch(() => setStations([]));
  }, []);

  const settingsError = draft ? validateSettings(draft) : null;
  const settingsChanged = draft && state ? JSON.stringify(draft) !== JSON.stringify(state.settings) : false;

  const saveSettings = async () => {
    if (!draft || settingsError) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const next = await api.calendarSettings(draft);
      setState(next);
      setDraft(next.settings);
      setMessage('График работы сохранён. Прогноз в «Календаре» пересчитан по новому графику.');
    } catch (e) {
      setError(e instanceof ApiError && e.detail ? e.detail : 'Не удалось сохранить график');
    } finally {
      setBusy(false);
    }
  };

  const days = useMemo(() => (state?.days ?? []).filter((d) => d.date.startsWith(`${year}-`)), [state, year]);
  const years = useMemo(() => [...new Set([new Date().getFullYear(), year, ...(state?.days ?? []).map((d) => +d.date.slice(0, 4))])].sort(), [state, year]);

  const apply = async (changes: CalendarDayChange[]) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      let next: CalendarState | null = null;
      for (let i = 0; i < changes.length; i += CHUNK) next = await api.calendarApply(changes.slice(i, i + CHUNK));
      if (next) setState(next);
      return true;
    } catch (e) {
      setError(e instanceof ApiError && e.detail ? e.detail : 'Не удалось сохранить изменения');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const check = () => {
    if (!state) return;
    setPreview(parseCalendarImport(text, state.settings));
    setMessage('');
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    setPreview(null);
  };

  const load = async () => {
    if (!preview || preview.errors.length > 0 || preview.rows.length === 0) return;
    if (await apply(preview.rows)) {
      setMessage(`Загружено дней: ${preview.rows.length}.`);
      setText('');
      setPreview(null);
      setYear(+preview.rows[0].date.slice(0, 4));
    }
  };

  const addManual = async () => {
    const date = parseDate(newDate);
    if (!date) { setError('Укажите дату'); return; }
    const hours = newKind === 'work' && (newFrom || newTo);
    if (hours && !(newFrom && newTo && newFrom < newTo)) { setError('Часы работы: начало должно быть раньше конца'); return; }
    const ok = await apply([{ date, kind: newKind, from: hours ? newFrom : null, to: hours ? newTo : null, note: newNote.trim() || null }]);
    if (ok) { setMessage(`Добавлено: ${ruDate(date)}.`); setNewDate(''); setNewNote(''); setNewFrom(''); setNewTo(''); setYear(+date.slice(0, 4)); }
  };

  return (
    <div className="calendar-admin">
      {draft && (
        <section className="rep-card" aria-label="График работы">
          <h2>График работы линии</h2>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Недельный шаблон: на его основе строится прогноз выпуска. Выходные, праздники и особые часы отдельных дат — ниже.
          </p>
          <div className="cal__add">
            <label>Смена с<input type="time" value={draft.shiftStart} onChange={(e) => setDraft({ ...draft, shiftStart: e.target.value })} /></label>
            <label>до<input type="time" value={draft.shiftEnd} onChange={(e) => setDraft({ ...draft, shiftEnd: e.target.value })} /></label>
            <label>Изделий в смену
              <input type="number" min={1} max={500} value={Number.isNaN(draft.perShift) ? '' : draft.perShift} onChange={(e) => setDraft({ ...draft, perShift: e.target.value === '' ? Number.NaN : Number(e.target.value) })} />
            </label>
          </div>
          <fieldset className="cal__weekdays">
            <legend>Рабочие дни</legend>
            {WEEKDAYS_SHORT.map((name, i) => (
              <label key={name} className="cal__check">
                <input type="checkbox" checked={draft.workdays.includes(i + 1)} onChange={(e) => setDraft({ ...draft, workdays: e.target.checked ? [...draft.workdays, i + 1].sort() : draft.workdays.filter((d) => d !== i + 1) })} />
                {name}
              </label>
            ))}
          </fieldset>
          <fieldset className="cal__breaks">
            <legend>Перерывы</legend>
            {draft.breaks.map((b, i) => (
              <div key={i} className="cal__add">
                <label>Перерыв с<input type="time" value={b.from} onChange={(e) => setDraft({ ...draft, breaks: draft.breaks.map((x, k) => (k === i ? { ...x, from: e.target.value } : x)) })} /></label>
                <label>до<input type="time" value={b.to} onChange={(e) => setDraft({ ...draft, breaks: draft.breaks.map((x, k) => (k === i ? { ...x, to: e.target.value } : x)) })} /></label>
                <button type="button" aria-label={`Удалить перерыв ${i + 1}`} onClick={() => setDraft({ ...draft, breaks: draft.breaks.filter((_, k) => k !== i) })}>Удалить</button>
              </div>
            ))}
            <button type="button" disabled={draft.breaks.length >= 4} onClick={() => setDraft({ ...draft, breaks: [...draft.breaks, { from: '12:00', to: '13:00' }] })}>Добавить перерыв</button>
          </fieldset>
          <fieldset className="cal__breaks">
            <legend>Посты контроля качества</legend>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Показываются на линии станций в окне «Прогресс сборки» после выбранной станции. Места — по карте контроля.
            </p>
            {(draft.controlPosts ?? []).map((post, i) => (
              <div key={i} className="cal__add">
                <label>Название
                  <input value={post.name} maxLength={40} onChange={(e) => setDraft({ ...draft, controlPosts: (draft.controlPosts ?? []).map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
                </label>
                <label>Стоит после станции
                  <select value={post.afterStation} onChange={(e) => setDraft({ ...draft, controlPosts: (draft.controlPosts ?? []).map((x, k) => (k === i ? { ...x, afterStation: e.target.value } : x)) })}>
                    <option value="">— выберите —</option>
                    {stations.map((s) => <option key={s} value={s}>Станция {s}</option>)}
                  </select>
                </label>
                <button type="button" aria-label={`Удалить пост контроля ${i + 1}`} onClick={() => setDraft({ ...draft, controlPosts: (draft.controlPosts ?? []).filter((_, k) => k !== i) })}>Удалить</button>
              </div>
            ))}
            <button type="button" disabled={(draft.controlPosts ?? []).length >= 10} onClick={() => setDraft({ ...draft, controlPosts: [...(draft.controlPosts ?? []), { name: `Пост контроля ${(draft.controlPosts ?? []).length + 1}`, afterStation: '' }] })}>Добавить пост контроля</button>
          </fieldset>
          {settingsError ? (
            <p role="alert" className="error" style={{ margin: 0 }}>{settingsError}</p>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Рабочее время смены: {Math.floor(workMinutes(draft) / 60)} ч {workMinutes(draft) % 60} мин; одно изделие примерно каждые {Math.round(takt(draft))} мин. Сокращённый день вмещает пропорционально меньше изделий.
            </p>
          )}
          <div className="modal-actions">
            <button type="button" disabled={!settingsChanged || busy} onClick={() => state && setDraft(state.settings)}>Отменить правки</button>
            <button type="button" className="primary" disabled={!settingsChanged || !!settingsError || busy} onClick={() => void saveSettings()}>Сохранить график</button>
          </div>
        </section>
      )}

      <section className="rep-card" aria-label="Загрузка календаря">
        <h2>Загрузка из Excel</h2>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Скопируйте из Excel столбцы или загрузите файл CSV/TSV. Таблица, столбцы по порядку: <b>дата</b> (ДД.ММ.ГГГГ), <b>тип</b> (выходной, праздник, рабочий, сокращённый), начало и конец рабочего дня, примечание.
        </p>
        <textarea aria-label="Вставка календаря из Excel" rows={6} className="mono" value={text} placeholder={'04.11.2026\tПраздник\t\t\tДень народного единства\n14.11.2026\tРабочий\t09:00\t15:00\tПеренос'} onChange={(e) => { setText(e.target.value); setPreview(null); }} />
        <div className="modal-actions">
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="sr-only" onChange={(e) => void readFile(e.target.files?.[0])} />
          <button type="button" onClick={() => fileRef.current?.click()}>Выбрать файл (CSV)</button>
          <button type="button" className="primary" disabled={!text.trim() || !state} onClick={check}>Проверить</button>
        </div>

        {preview && (
          <div aria-label="Результат проверки">
            <p><strong>Строк: {preview.rows.length + preview.errors.length} · Ошибок: {preview.errors.length}</strong></p>
            {preview.errors.length > 0 && (
              <ul className="error" role="alert">
                {preview.errors.slice(0, 20).map((e) => <li key={e.line}>Строка {e.line}: {e.message}</li>)}
              </ul>
            )}
            {preview.rows.length > 0 && (
              <div className="table-wrap" style={{ maxHeight: 220, overflow: 'auto' }}>
                <table>
                  <thead><tr><th>Дата</th><th>Тип</th><th>Часы</th><th>Примечание</th></tr></thead>
                  <tbody>
                    {preview.rows.slice(0, 50).map((r) => (
                      <tr key={r.date}><td>{ruDate(r.date)}</td><td>{kindLabel(r.kind!, r.from ?? null)}</td><td>{r.from ? `${r.from}–${r.to}` : '—'}</td><td>{r.note ?? '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="primary" disabled={busy || preview.errors.length > 0 || preview.rows.length === 0} onClick={() => void load()}>
                {busy ? 'Загрузка…' : 'Загрузить в календарь'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rep-card" aria-label="Добавить день">
        <h2>Добавить день вручную</h2>
        <div className="cal__add">
          <label>Дата<input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} /></label>
          <label>Тип
            <select value={newKind} onChange={(e) => setNewKind(e.target.value as 'off' | 'work')}>
              <option value="off">Выходной / праздник</option>
              <option value="work">Рабочий (перенос, особые часы)</option>
            </select>
          </label>
          <label>С<input type="time" value={newFrom} disabled={newKind === 'off'} onChange={(e) => setNewFrom(e.target.value)} /></label>
          <label>До<input type="time" value={newTo} disabled={newKind === 'off'} onChange={(e) => setNewTo(e.target.value)} /></label>
          <label>Примечание<input value={newNote} maxLength={100} onChange={(e) => setNewNote(e.target.value)} /></label>
          <button type="button" className="primary" disabled={busy || !newDate} onClick={() => void addManual()}>Добавить</button>
        </div>
      </section>

      {error && <p role="alert" className="error">{error}</p>}
      {message && <p role="status" className="cal__notice" style={{ margin: 0 }}>{message}</p>}

      <section className="rep-card" aria-label="Отметки календаря">
        <div className="cal__list-head">
          <h2>Отметки календаря</h2>
          <label>Год
            <select value={year} onChange={(e) => setYear(+e.target.value)} aria-label="Год">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Дата</th><th>День</th><th>Тип</th><th>Часы</th><th>Примечание</th><th /></tr></thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date}>
                  <td>{ruDate(d.date)}</td>
                  <td>{WEEKDAYS_SHORT[isoWeekday(d.date) - 1]}</td>
                  <td>{kindLabel(d.kind, d.from)}</td>
                  <td>{d.from ? `${d.from}–${d.to}` : '—'}</td>
                  <td>{d.note ?? '—'}</td>
                  <td><button type="button" disabled={busy} aria-label={`Удалить отметку ${ruDate(d.date)}`} onClick={() => void apply([{ date: d.date, kind: null }])}>Удалить</button></td>
                </tr>
              ))}
              {days.length === 0 && <tr><td colSpan={6} className="center muted">На {year} год отметок нет: действует стандартный график</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
