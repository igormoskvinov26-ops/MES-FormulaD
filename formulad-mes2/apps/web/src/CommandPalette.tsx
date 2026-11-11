import { useEffect, useRef, useState } from 'react';
import type { Screen } from './AppHeader';

const SCREENS: { key: Screen; label: string; aliases: string[] }[] = [
  { key: 'plan', label: 'Производственный план', aliases: ['план', 'plan'] },
  { key: 'import', label: 'Импорт плана', aliases: ['импорт', 'import'] },
  { key: 'start', label: 'Старт', aliases: ['старт', 'start'] },
  { key: 'stations', label: 'Станции', aliases: ['станции', 'stations'] },
  { key: 'complete', label: 'Завершение', aliases: ['завершение', 'complete'] },
  { key: 'fok', label: 'FOK', aliases: ['фок', 'fok'] },
  { key: 'rework', label: 'Rework', aliases: ['доработка', 'rework'] },
  { key: 'ncp', label: 'Несоответствия', aliases: ['несоответствия', 'ncp'] },
  { key: 'incoming', label: 'Входной контроль', aliases: ['входной', 'incoming'] },
  { key: 'reports', label: 'Отчётность', aliases: ['отчёт', 'reports'] },
  { key: 'admin', label: 'Администрирование', aliases: ['админ', 'admin'] },
];

export function CommandPalette({ onNavigate, onVinSearch }: { onNavigate: (s: Screen) => void; onVinSearch: (vin: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen((v) => !v); setQ(''); setIdx(0); }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  if (!open) return null;

  const lq = q.toLowerCase().trim();
  const matches = lq ? SCREENS.filter((s) => s.label.toLowerCase().includes(lq) || s.aliases.some((a) => a.includes(lq))) : SCREENS;
  // ponytail: VIN-like input goes straight to search
  const looksLikeVin = /^[A-Za-z0-9-]{4,}$/.test(lq) && matches.length === 0;

  function pick(key: Screen) { setOpen(false); onNavigate(key); }
  function submit() {
    if (looksLikeVin) { setOpen(false); onVinSearch(q.trim()); return; }
    if (matches[idx]) pick(matches[idx].key);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, matches.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  }

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="cmd-palette" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Палитра команд">
        <input ref={inputRef} className="cmd-input" placeholder="Перейти к разделу или найти VIN…" value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} onKeyDown={onKeyDown} aria-label="Поиск раздела" />
        <ul className="cmd-list" role="listbox">
          {matches.map((s, i) => (
            <li key={s.key} role="option" aria-selected={i === idx} className={i === idx ? 'cmd-item active' : 'cmd-item'} onClick={() => pick(s.key)} onMouseEnter={() => setIdx(i)}>
              {s.label}
            </li>
          ))}
          {looksLikeVin && (
            <li role="option" aria-selected className="cmd-item active" onClick={() => submit()}>
              Найти VIN: {q.trim()}
            </li>
          )}
          {matches.length === 0 && !looksLikeVin && <li className="cmd-item muted">Ничего не найдено</li>}
        </ul>
        <div className="cmd-footer muted">
          <kbd>↑↓</kbd> навигация <kbd>Enter</kbd> выбор <kbd>Esc</kbd> закрыть
        </div>
      </div>
    </div>
  );
}
