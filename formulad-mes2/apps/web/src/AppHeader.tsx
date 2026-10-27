import { useEffect, useState } from 'react';
import { api } from './api';
import { QuadMark } from './QuadMark';

export type Screen = 'plan' | 'ncp' | 'start' | 'complete' | 'fok';

/** Дата и время смены в шапке — как в концепте: оператор не лезет в угол Windows. */
function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const date = now.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
  const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return (
    <span className="topbar-clock">
      {date} · {time}
    </span>
  );
}

const TABS: { key: Screen; label: string }[] = [
  { key: 'plan', label: 'Производственный план' },
  { key: 'start', label: 'Старт' },
  { key: 'complete', label: 'Завершение' },
  { key: 'fok', label: 'FOK' },
  { key: 'ncp', label: 'Несоответствия' },
];

/** Общая шапка всех экранов. Навигация — простые вкладки, не боковое меню: пунктов пока два,
    полноценный sidebar из концепта откладывается до тех пор, пока их не станет больше. */
export function AppHeader({
  screen,
  onNavigate,
  session,
  onLogout,
}: {
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  session: { userName: string | null; mode: string };
  onLogout: () => void;
}) {
  return (
    <header className="topbar">
      <span className="logo" aria-label="F7 MES">
        <QuadMark className="logo-icon" />
        F<span className="logo-mark">7</span>
        <span className="logo-suffix">MES</span>
      </span>
      <span className="slash" aria-hidden="true" />
      <nav className="topnav" aria-label="Разделы">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={tab.key === screen ? 'topnav-tab active' : 'topnav-tab'}
            aria-current={tab.key === screen ? 'page' : undefined}
            onClick={() => onNavigate(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <span className="badge badge-demo" title="Синтетические данные, не производственные">
        DEMO
      </span>
      <span className="spacer" />
      <Clock />
      <span className="topbar-user">{session.userName ?? 'неизвестно'}</span>
      <button
        type="button"
        className="ghost"
        onClick={async () => {
          await api.logout().catch(() => undefined);
          onLogout();
        }}
      >
        Выход
      </button>
    </header>
  );
}
