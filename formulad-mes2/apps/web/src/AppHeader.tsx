import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { api } from './api';
import { isSidebarCollapsed, setSidebarCollapsed, subscribeSidebar } from './sidebarPref';
import { IconPlan, IconCalendar, IconImport, IconStart, IconStations, IconComplete, IconFok, IconRework, IconNcp, IconIncoming, IconReports, IconAdmin, IconQc, IconLineMap } from './SidebarIcons';
import { SettingsDialog } from './SettingsDialog';

export type Screen = 'plan' | 'calendar' | 'ncp' | 'start' | 'stations' | 'complete' | 'fok' | 'rework' | 'import' | 'incoming' | 'qc' | 'reports' | 'admin' | 'lineMap';


function MobileToggle() {
  const [mobile, setMobile] = useState(() => document.documentElement.getAttribute('data-layout') === 'mobile');
  function toggle() {
    const next = !mobile;
    if (next) document.documentElement.setAttribute('data-layout', 'mobile');
    else document.documentElement.removeAttribute('data-layout');
    try { localStorage.setItem('f7-layout', next ? 'mobile' : 'desktop'); } catch { /* */ }
    setMobile(next);
  }
  return (
    <button type="button" className="ghost icon-btn" onClick={toggle} aria-pressed={mobile} aria-label="Мобильный вид" title={mobile ? 'Настольный вид' : 'Мобильный вид'}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {mobile
          ? <><rect x="2" y="1" width="14" height="16" rx="2" /><path d="M7 14h4" /></>
          : <><rect x="4" y="3" width="6" height="10" rx="1.2" /><path d="M6 11.5h2" /></>}
      </svg>
    </button>
  );
}

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
  { key: 'calendar', label: 'Календарь', Icon: IconCalendar },
  { key: 'import', label: 'Импорт плана', Icon: IconImport },
  { key: 'start', label: 'Старт', Icon: IconStart, group: 'Производство' },
  { key: 'stations', label: 'Станции', Icon: IconStations },
  { key: 'complete', label: 'Завершение', Icon: IconComplete },
  { key: 'fok', label: 'FOK', Icon: IconFok },
  { key: 'rework', label: 'Rework', Icon: IconRework },
  { key: 'ncp', label: 'Несоответствия', Icon: IconNcp, group: 'Качество' },
  { key: 'incoming', label: 'Входной контроль', Icon: IconIncoming },
  { key: 'qc', label: 'Контрольная карта', Icon: IconQc },
  { key: 'lineMap', label: 'Карта линии', Icon: IconLineMap },
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
  // Название экрана уже стоит крупным заголовком на странице — в верхней полосе показываем только раздел.
  let crumb = 'Планирование';
  for (const tab of TABS) {
    if (tab.group) crumb = tab.group;
    if (tab.key === screen) break;
  }
  const [collapsed, setCollapsed] = useState(isSidebarCollapsed);
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => subscribeSidebar(() => setCollapsed(isSidebarCollapsed())), []);
  const toggleSidebar = () => setSidebarCollapsed(!collapsed);
  return (
    <>
      <nav className="sidebar" aria-label="Разделы">
        <img className="sidebar-logo" src="/f7-logo.png" alt="F7 MES" />
        <img className="sidebar-mark" src="/f7-mark.png" alt="" />
        <ul className="sidebar-nav">
          {TABS.map((tab) => (
            <li key={tab.key}>
              {tab.group && <span className="sidebar-group"><span className="sidebar-label">{tab.group}</span></span>}
              <button
                type="button"
                className={tab.key === screen ? 'sidebar-link active' : 'sidebar-link'}
                aria-current={tab.key === screen ? 'page' : undefined}
                title={tab.label}
                onClick={() => onNavigate(tab.key)}
              >
                <tab.Icon className="sidebar-icon" />
                <span className="sidebar-label">{tab.label}</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="sidebar-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          onClick={toggleSidebar}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="sidebar-toggle-icon"><path d="M10 3 5 8l5 5" /></svg>
          <span className="sidebar-label">Свернуть</span>
        </button>
      </nav>
      <header className="topbar">
        <span className="topbar-crumb" title={current?.label}>{crumb}</span>
        <span className="spacer" />
        <span className="badge badge-demo" title="Синтетические данные, не производственные">DEMO</span>
        <span className="topbar-commit" title="Версия сборки">{__COMMIT__}</span>
        <MobileToggle />
        <button type="button" className="ghost icon-btn" onClick={() => setShowSettings(true)} aria-label="Настройки" title="Настройки">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="9" r="2.5"/><path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.2 3.2l1.4 1.4M13.4 13.4l1.4 1.4M3.2 14.8l1.4-1.4M13.4 4.6l1.4-1.4"/></svg>
        </button>
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
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </>
  );
}
