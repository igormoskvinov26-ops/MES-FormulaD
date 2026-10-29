import { useEffect, useRef, useState } from 'react';
import type { ProductionPlanItem } from './api';

/**
 * Перенос изделия на произвольную позицию. Перед подтверждением показывает,
 * между какими изделиями оно встанет: ввод голого номера без обратной связи —
 * главный источник ошибок при правке плана.
 */
export function MoveDialog({
  item,
  items,
  onMove,
  onClose,
}: {
  item: ProductionPlanItem;
  items: ProductionPlanItem[];
  onMove: (toPosition: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(String(item.seqn ?? ''));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.select(), []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const positions = items.filter((i) => i.seqn !== null);
  const target = Number(value);
  const targetIndex = positions.findIndex((i) => i.seqn === target);
  const valid = Number.isInteger(target) && targetIndex >= 0 && target !== item.seqn;

  function preview() {
    if (!Number.isInteger(target) || targetIndex < 0) return 'Позиции с таким номером нет в плане';
    if (target === item.seqn) return 'Изделие уже стоит на этой позиции';

    // Повторяем ровно тот же порядок действий, что и сервер: убрать строку и вставить её
    // на место целевой позиции. Иначе предпросмотр однажды разойдётся с результатом.
    const result = positions.filter((i) => i.vin !== item.vin);
    result.splice(targetIndex, 0, item);

    const index = result.findIndex((i) => i.vin === item.vin);
    const before = result[index - 1]?.vin ?? 'началом плана';
    const after = result[index + 1]?.vin ?? 'концом плана';
    return `Встанет между ${before} и ${after}`;
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Переместить изделие ${item.vin}`}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onMove(target);
        }}
      >
        <h2>Переместить изделие</h2>
        <dl>
          <div>
            <dt>VIN</dt>
            <dd className="mono">{item.vin}</dd>
          </div>
          <div>
            <dt>Модель</dt>
            <dd>{item.modelArticle ?? '—'}</dd>
          </div>
          <div>
            <dt>Текущая позиция</dt>
            <dd>{item.seqn ?? '—'}</dd>
          </div>
        </dl>
        <label>
          Новая позиция
          <input
            ref={inputRef}
            type="number"
            min={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <p className={valid ? 'preview' : 'preview preview-bad'}>{preview()}</p>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Отмена (Esc)
          </button>
          <button type="submit" disabled={!valid}>
            Переместить (Enter)
          </button>
        </div>
      </form>
    </div>
  );
}
