import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { api } from './api';
import { QuadMark } from './QuadMark';
import { IconPlan, IconImport, IconStart, IconStations, IconComplete, IconFok, IconRework, IconNcp, IconIncoming, IconReports, IconAdmin } from './SidebarIcons';

export type Screen = 'plan' | 'ncp' | 'start' | 'stations' | 'complete' | 'fok' | 'rework' | 'import' | 'incoming' | 'reports' | 'admin';

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

type Tab = { key: Screen; label: string; Icon: ComponentType<{ className?: string }>; group?: string };

const TABS: Tab[] = [
  { key: 'plan', label: 'Производственный план', Icon: IconPlan },
  { key: 'import', label: 'Импорт плана', Icon: IconImport },
  { key: 'start', label: 'Старт', Icon: IconStart, group: 'Производство' },
  { key: 'stations', label: 'Станции', Icon: IconStations },
  { key: 'complete', label: 'Завершение', Icon: IconComplete },
  { key: 'fok', label: 'FOK', Icon: IconFok },
  { key: 'rework', label: 'Rework', Icon: IconRework },
  { key: 'ncp', label: 'Несоответствия', Icon: IconNcp, group: 'Качество' },
  { key: 'incoming', label: 'Входной контроль', Icon: IconIncoming },
  { key: 'reports', label: 'Отчётность', Icon: IconReports },
  { key: 'admin', label: 'Администрирование', Icon: IconAdmin, group: 'Администрирование' },
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
              {tab.group && <span className="sidebar-group">{tab.group}</span>}
              <button
                type="button"
                className={tab.key === screen ? 'sidebar-link active' : 'sidebar-link'}
                aria-current={tab.key === screen ? 'page' : undefined}
                onClick={() => onNavigate(tab.key)}
              >
                <tab.Icon className="sidebar-icon" />
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="theme-switch" onClick={() => {
          const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', next);
          try { localStorage.setItem('f7-theme', next); } catch {}
        }} aria-label="Переключить тему">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="3"/><path d="M8 1v2m0 10v2m-5-7H1m14 0h-2m-1.5-4.5L10 5m-4-1.5L4.5 5m7 7L10 11m-4 1.5L4.5 11"/></svg>
          Тема
        </button>
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
