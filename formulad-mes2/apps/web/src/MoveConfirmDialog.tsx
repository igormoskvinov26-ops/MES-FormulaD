import { useEffect } from 'react';
import type { MovePreview } from './calendarMove';
import { dayLabel } from './CalendarViews';

const when = (s: { date: string; time: string }) => `${dayLabel(s.date)}, ${s.time}`;

export function MoveConfirmDialog({
  vin,
  preview,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  vin: string;
  preview: MovePreview;
  busy: boolean;
  error: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  const others = preview.changed.filter((c) => c.vin !== vin);
  const dayMoved = others.filter((c) => c.from.date !== c.to.date);
  const key = (s: { date: string; time: string }) => `${s.date}T${s.time}`;
  const earlier = others.filter((c) => key(c.to) < key(c.from)).length;
  const later = others.length - earlier;

  return (
    <div className="modal-backdrop" onMouseDown={() => !busy && onCancel()}>
      <div className="modal cal__confirm" role="dialog" aria-modal="true" aria-label={`Перенос изделия ${vin}`} onMouseDown={(e) => e.stopPropagation()}>
        <h2>Перенести изделие {vin}?</h2>
        <p className="cal__move-line">
          <span>{when(preview.from)}</span>
          <span aria-hidden="true">→</span>
          <strong>{when(preview.to)}</strong>
        </p>
        <p>
          {others.length === 0
            ? 'Остальные изделия не сдвигаются.'
            : <>Сдвинется по времени ещё <strong>{others.length}</strong> {others.length === 1 ? 'изделие' : 'изделий'}: {earlier} раньше, {later} позже{dayMoved.length > 0 ? `; другой день у ${dayMoved.length}` : ''}.</>}
        </p>
        {others.length > 0 && (
          <ul className="cal__move-list" aria-label="Затронутые изделия">
            {others.slice(0, 8).map((c) => (
              <li key={c.vin}><span className="mono">{c.vin}</span> {when(c.from)} → {when(c.to)}</li>
            ))}
            {others.length > 8 && <li className="muted">и ещё {others.length - 8}</li>}
          </ul>
        )}
        <p className="muted" style={{ fontSize: 14 }}>
          Меняется порядок запуска в плане (позиция {preview.toPosition}); плановые даты завершения и отгрузки не меняются. Перенос записывается в журнал, его можно отменить сразу после выполнения.
        </p>
        {error && <p role="alert" className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" disabled={busy} onClick={onCancel}>Отмена (Esc)</button>
          <button type="button" className="primary" disabled={busy} onClick={onConfirm}>{busy ? 'Перенос…' : 'Перенести'}</button>
        </div>
      </div>
    </div>
  );
}
