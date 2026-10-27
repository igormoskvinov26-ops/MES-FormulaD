import { useEffect, useState } from 'react';
import { api } from './api';
import { QuadMark } from './QuadMark';

export type Screen = 'plan' | 'ncp' | 'start' | 'stations' | 'complete' | 'fok';

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
  { key: 'stations', label: 'Станции' },
  { key: 'complete', label: 'Завершение' },
  { key: 'fok', label: 'FOK' },
  { key: 'ncp', label: 'Несоответствия' },
];

/** Общая навигация всех экранов: боковое меню (фиксированное, только для рабочего места на ПК)
    плюс тонкая верхняя полоса с текущим разделом, часами и выходом. Раньше это были вкладки
    в один ряд — оправдано было, пока раздел всего два; сейчас их пять, и боковое меню читается
    быстрее. Боковая панель позиционирована фиксированно, `.app` компенсирует отступом в CSS —
    экраны (PlanScreen/NcpScreen/ScanTransitionScreen) не меняются. */
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
  const current = TABS.find((tab) => tab.key === screen);
  return (
    <>
      <nav className="sidebar" aria-label="Разделы">
        <span className="logo" aria-label="F7 MES">
          <QuadMark className="logo-icon" />
          F<span className="logo-mark">7</span>
          <span className="logo-suffix">MES</span>
        </span>
        <ul className="sidebar-nav">
          {TABS.map((tab) => (
            <li key={tab.key}>
              <button
                type="button"
                className={tab.key === screen ? 'sidebar-link active' : 'sidebar-link'}
                aria-current={tab.key === screen ? 'page' : undefined}
                onClick={() => onNavigate(tab.key)}
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
        <span className="badge badge-demo" title="Синтетические данные, не производственные">
          DEMO
        </span>
      </nav>
      <header className="topbar">
        <span className="topbar-title">{current?.label}</span>
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
    </>
  );
}
