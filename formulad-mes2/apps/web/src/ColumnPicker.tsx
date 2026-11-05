import { useEffect, useRef, useState } from 'react';
import { COLUMNS } from './columns';

/** Меню выбора видимых колонок. Раскладка запоминается на этом рабочем месте. */
export function ColumnPicker({
  visible,
  onToggle,
  onReset,
}: {
  visible: string[];
  onToggle: (key: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocument(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocument);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onDocument);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  return (
    <div className="picker" ref={root}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Поля ({visible.length})
      </button>
      {open && (
        <div className="picker-menu" role="group" aria-label="Видимые колонки">
          <p className="picker-hint">Раскладка сохраняется на этом компьютере</p>
          {COLUMNS.map((column) => (
            <label key={column.key} className={column.locked ? 'locked' : undefined}>
              <input
                type="checkbox"
                checked={column.locked || visible.includes(column.key)}
                disabled={column.locked}
                onChange={() => onToggle(column.key)}
              />
              {column.label}
              {column.locked && <span className="muted"> · всегда</span>}
            </label>
          ))}
          <button type="button" className="link" onClick={onReset}>
            Вернуть стандартную раскладку
          </button>
        </div>
      )}
    </div>
  );
}
