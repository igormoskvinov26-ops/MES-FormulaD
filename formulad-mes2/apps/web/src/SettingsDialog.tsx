import { useEffect, useState } from 'react';
import { api } from './api';

type Theme = 'light' | 'dark' | 'soft';

function getTheme(): Theme {
  const t = document.documentElement.getAttribute('data-theme');
  return (t === 'dark' || t === 'soft') ? t : 'light';
}

function applyTheme(t: Theme) {
  if (t === 'light') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('f7-theme', t); } catch { /* */ }
}

export function getRefreshInterval(): number {
  const v = parseInt(localStorage.getItem('f7-refresh-interval') ?? '', 10);
  return Number.isFinite(v) && v >= 0 ? v : 60;
}

const THEMES: { value: Theme; label: string; desc: string }[] = [
  { value: 'light', label: 'Светлая', desc: 'Высокий контраст, белый фон' },
  { value: 'dark', label: 'Тёмная', desc: 'Тёмный фон, пониженная яркость' },
  { value: 'soft', label: 'Мягкая', desc: 'Тёплый кремовый фон, стальной акцент' },
];

const REFRESH_OPTIONS = [
  { label: 'Выкл.', value: 0 },
  { label: '30 с', value: 30 },
  { label: '1 мин', value: 60 },
  { label: '2 мин', value: 120 },
  { label: '5 мин', value: 300 },
];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [theme, setTheme] = useState<Theme>(getTheme);
  const [version, setVersion] = useState<string | null>(null);
  const [compact, setCompact] = useState(() => localStorage.getItem('f7-plan-compact') === '1');
  const [refresh, setRefresh] = useState(getRefreshInterval);

  useEffect(() => {
    api.info().then((r) => setVersion(r.version)).catch(() => {});
  }, []);

  function pick(t: Theme) {
    setTheme(t);
    applyTheme(t);
  }

  function pickCompact(v: boolean) {
    setCompact(v);
    try { localStorage.setItem('f7-plan-compact', v ? '1' : '0'); } catch { /* */ }
  }

  function pickRefresh(v: number) {
    setRefresh(v);
    try { localStorage.setItem('f7-refresh-interval', String(v)); } catch { /* */ }
    window.dispatchEvent(new CustomEvent('f7-refresh-interval-change', { detail: v }));
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal aria-label="Настройки">
      <div className="modal-box settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Настройки</h2>
          <button type="button" className="ghost icon-btn" onClick={onClose} aria-label="Закрыть">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14"/></svg>
          </button>
        </div>
        <section className="settings-section">
          <h3>Цветовая схема</h3>
          <div className="settings-theme-grid">
            {THEMES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`settings-theme-btn${theme === opt.value ? ' active' : ''}`}
                aria-pressed={theme === opt.value}
                onClick={() => pick(opt.value)}
              >
                <span className="settings-theme-swatch" data-theme-preview={opt.value} />
                <span className="settings-theme-label">{opt.label}</span>
                <span className="settings-theme-desc">{opt.desc}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="settings-section">
          <h3>Плотность таблиц</h3>
          <div className="settings-row">
            <label>
              <input type="radio" name="density" checked={!compact} onChange={() => pickCompact(false)} />
              Стандартная
            </label>
            <label>
              <input type="radio" name="density" checked={compact} onChange={() => pickCompact(true)} />
              Компактная
            </label>
          </div>
        </section>
        <section className="settings-section">
          <h3>Автообновление плана</h3>
          <div className="settings-row">
            {REFRESH_OPTIONS.map((opt) => (
              <label key={opt.value}>
                <input type="radio" name="refresh" checked={refresh === opt.value} onChange={() => pickRefresh(opt.value)} />
                {opt.label}
              </label>
            ))}
          </div>
        </section>
        {version && (
          <footer className="settings-version">v{version}</footer>
        )}
      </div>
    </div>
  );
}
