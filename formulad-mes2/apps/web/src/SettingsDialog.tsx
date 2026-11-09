import { useEffect, useState } from 'react';
import { getDensity, setDensity, subscribeDensity, type Density } from './densityPref';
import { isSoundOn, setSoundOn, subscribeSound } from './resultSignal';

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sound, setSound] = useState(isSoundOn);
  const [density, setDens] = useState<Density>(getDensity);
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');

  useEffect(() => subscribeSound(() => setSound(isSoundOn())), []);
  useEffect(() => subscribeDensity(() => setDens(getDensity())), []);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Настройки">
        <h2 style={{ margin: '0 0 16px', fontSize: 20 }}>Настройки</h2>

        <label className="settings-row">
          <span>Звук сканера</span>
          <button type="button" aria-pressed={sound} onClick={() => { setSoundOn(!sound); setSound(!sound); }}>
            {sound ? 'Вкл' : 'Выкл'}
          </button>
        </label>

        <label className="settings-row">
          <span>Плотность таблиц</span>
          <button type="button" aria-pressed={density === 'compact'} onClick={() => { const next = density === 'compact' ? 'comfortable' : 'compact'; setDensity(next); setDens(next); }}>
            {density === 'compact' ? 'Компактно' : 'Комфортно'}
          </button>
        </label>

        <label className="settings-row">
          <span>Тема</span>
          <button type="button" aria-pressed={dark} onClick={() => {
            const next = dark ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            try { localStorage.setItem('f7-theme', next); } catch { /* ok */ }
            setDark(!dark);
          }}>
            {dark ? 'Тёмная' : 'Светлая'}
          </button>
        </label>

        <p className="muted" style={{ marginTop: 16, fontSize: 13 }}>
          Авто-обновление и привязка к станции появятся в следующей версии.
        </p>

        <button type="button" style={{ marginTop: 12, width: '100%' }} onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
