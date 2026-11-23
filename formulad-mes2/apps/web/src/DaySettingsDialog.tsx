import { useEffect, useState } from 'react';
import type { CalendarConfig, DayInfo } from './calendar';

export type DayDraft = { kind: 'off' | 'work' | null; from: string | null; to: string | null; note: string | null };

const minutes = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);

export function DaySettingsDialog({
  date,
  label,
  info,
  draft,
  cfg,
  onOk,
  onCancel,
}: {
  date: string;
  label: string;
  info: DayInfo;
  draft: DayDraft | undefined;
  cfg: CalendarConfig;
  onOk: (draft: DayDraft) => void;
  onCancel: () => void;
}) {
  const startOff = draft ? draft.kind === 'off' : !info.working;
  const startWork = draft?.kind === 'work';
  const [off, setOff] = useState(startOff);
  const [from, setFrom] = useState((startWork && draft?.from) || info.from);
  const [to, setTo] = useState((startWork && draft?.to) || info.to);
  const [note, setNote] = useState((draft ? draft.note : info.override?.note) ?? '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const hoursValid = from !== '' && to !== '' && minutes(from) < minutes(to);
  const valid = off || hoursValid;

  const submit = () => {
    const text = note.trim() || null;
    if (off) {
      onOk(!info.natural && !text ? { kind: null, from: null, to: null, note: null } : { kind: 'off', from: null, to: null, note: text });
      return;
    }
    const sameHours = from === cfg.shiftStart && to === cfg.shiftEnd;
    if (info.natural && sameHours && !text) onOk({ kind: null, from: null, to: null, note: null });
    else onOk({ kind: 'work', from: sameHours ? null : from, to: sameHours ? null : to, note: text });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Настройка дня ${label}`}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) submit();
        }}
      >
        <h2>Настройка дня · {label}</h2>
        <p className="muted" style={{ margin: 0 }}>{date}</p>
        <label className="cal__check">
          <input type="checkbox" checked={off} onChange={(e) => setOff(e.target.checked)} />
          Праздник / выходной
        </label>
        <div className="cal__hours" aria-disabled={off}>
          <label>Рабочий день с
            <input type="time" value={from} disabled={off} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>до
            <input type="time" value={to} disabled={off} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        {!off && !hoursValid && <p role="alert" className="error" style={{ margin: 0 }}>Начало должно быть раньше конца</p>}
        <label>Примечание
          <input value={note} maxLength={100} placeholder="например, День народного единства" onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>Отмена (Esc)</button>
          <button type="submit" className="primary" disabled={!valid}>ОК</button>
        </div>
      </form>
    </div>
  );
}
