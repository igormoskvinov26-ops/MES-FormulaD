import { useEffect, useRef, useState } from 'react';
import { api, type ProductionPlanItem } from './api';

type Props = {
  onSelectVin: (vin: string) => void;
};

export function CommandPalette({ onSelectVin }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ProductionPlanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // T-085: Ctrl/Cmd+K — открыть палитру
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Фокус при открытии
  useEffect(() => {
    if (open) {
      setQuery('');
      setItems([]);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Поиск VIN с дебаунсом
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) { setItems([]); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      api.plan({ vin: q, page: 1, pageSize: 10 })
        .then((r) => setItems(r.items))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open]);

  if (!open) return null;

  return (
    <div className="cp-backdrop" onClick={() => setOpen(false)}>
      <div className="cp-modal" role="dialog" aria-modal aria-label="Командная палитра" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cp-input"
          type="text"
          placeholder="Введите VIN…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {loading && <div className="cp-hint">Поиск…</div>}
        {!loading && items.length === 0 && query.trim() && (
          <div className="cp-hint">Не найдено</div>
        )}
        <ul className="cp-list" role="listbox">
          {items.map((item) => (
            <li key={item.vin} role="option" aria-selected={false}>
              <button
                type="button"
                className="cp-item"
                onClick={() => { onSelectVin(item.vin); setOpen(false); }}
              >
                <span className="cp-vin">{item.vin}</span>
                {item.modelArticle && <span className="cp-meta">{item.modelArticle}</span>}
                {item.color && <span className="cp-meta">{item.color}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
