import { useCallback, useEffect, useRef, useState } from 'react';
import type { Screen } from './AppHeader';
import { ApiError, api, type Paged, type ProductionPlanItem } from './api';
import { PlanScreen } from './PlanScreen';
import { CommandPalette } from './CommandPalette';
import { NcpScreen } from './NcpScreen';
import { StartScreen } from './StartScreen';
import { StationScreen } from './StationScreen';
import { CompleteScreen } from './CompleteScreen';
import { FokScreen } from './FokScreen';
import { ReworkScreen } from './ReworkScreen';
import { CalendarScreen } from './CalendarScreen';
import { ImportScreen } from './ImportScreen';
import { IncomingInspectionScreen } from './IncomingInspectionScreen';
import { QcScreen } from './QcScreen';
import { LineMapScreen } from './LineMapScreen';
import { LoginScreen } from './LoginScreen';
import { ReportsScreen } from './ReportsScreen';
import { AdminScreen } from './AdminScreen';
import { BootScreen } from './Skeleton';

type Session = { userName: string | null; mode: string } | null;

export function App() {
  const [session, setSession] = useState<Session>(null);
  const [checking, setChecking] = useState(true);
  const [screen, setScreen] = useState<Screen>('plan');
  const [pendingVin, setPendingVin] = useState<string | undefined>();

  function handleVinSearch(vin: string) {
    setPendingVin(vin);
    setScreen('plan');
  }

  useEffect(() => {
    api
      .me()
      .then((me) => setSession({ userName: me.userName, mode: me.mode }))
      .catch(() => setSession(null))
      .finally(() => setChecking(false));
  }, []);

  // T-016: 30-minute inactivity auto-logout
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      api.logout().catch(() => undefined).finally(() => setSession(null));
    }, 30 * 60 * 1000);
  }, []);
  useEffect(() => {
    if (!session) return;
    const events = ['mousemove', 'keydown', 'touchstart', 'click'] as const;
    events.forEach((e) => window.addEventListener(e, resetIdle, { passive: true }));
    resetIdle();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdle));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [session, resetIdle]);

  if (checking) {
    return <BootScreen />;
  }

  if (!session) {
    return <LoginScreen onLoggedIn={(userName) => setSession({ userName, mode: 'dev' })} />;
  }

  const onLogout = () => setSession(null);
  const s = session;

  return (
    <>
      <CommandPalette onSelectVin={handleVinSearch} />
      {renderScreen()}
    </>
  );

  function renderScreen() { switch (screen) {
    case 'plan':
      return <PlanScreen key={pendingVin ?? ''} initialVin={pendingVin} session={s} onNavigate={setScreen} onLogout={onLogout} />;
    case 'calendar':
      return <CalendarScreen session={s} onNavigate={setScreen} onLogout={onLogout} />;
    case 'import':
      return <ImportScreen session={s} onNavigate={setScreen} onLogout={onLogout} />;
    case 'start':
      return <StartScreen session={s} onNavigate={setScreen} onLogout={onLogout} />;
    case 'stations':
      return <StationScreen session={s} onNavigate={setScreen} onLogout={onLogout} />;
    case 'complete':
      return <CompleteScreen session={s} onNavigate={setScreen} onLogout={onLogout} />;
    case 'fok':
      return <FokScreen session={s} onNavigate={setScreen} onLogout={onLogout} />;
    case 'rework':
      return <ReworkScreen session={s} onNavigate={setScreen} onLogout={onLogout} />;
    case 'ncp':
      return <NcpScreen session={s} onNavigate={setScreen} onLogout={onLogout} />;
    case 'incoming':
      return <IncomingInspectionScreen session={s} onNavigate={setScreen} onLogout={onLogout} />;
    case 'qc':
      return <QcScreen session={s} onNavigate={setScreen} onLogout={onLogout} />;
    case 'lineMap':
      return <LineMapScreen session={s} onNavigate={setScreen} onLogout={onLogout} />;
    case 'reports':
      return <ReportsScreen session={s} onNavigate={setScreen} onLogout={onLogout} />;
    case 'admin':
      return <AdminScreen session={s} onNavigate={setScreen} onLogout={onLogout} />;
  } }
}

export function usePlan(vin: string, status: string | null, page: number, pageSize: number, statusId?: number) {
  const [data, setData] = useState<Paged<ProductionPlanItem> | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string>('');
  const requestId = useRef(0);

  const reload = useCallback(() => {
    const id = ++requestId.current;
    setState('loading');
    api
      .plan({ vin, status, statusId, page, pageSize })
      .then((result) => {
        if (id !== requestId.current) return;
        setData(result);
        setState('ready');
      })
      .catch((e: unknown) => {
        if (id !== requestId.current) return;
        setError(e instanceof ApiError && e.status === 401 ? 'Нет доступа' : 'Нет связи с сервером');
        setState('error');
      });
  }, [vin, status, page, pageSize, statusId]);

  useEffect(reload, [reload]);

  return { data, state, error, reload };
}

export type PlanCounts = { all: number; 0: number; 1: number; 2: number; 3: number } | null;

export function usePlanCounts(): PlanCounts {
  const [counts, setCounts] = useState<PlanCounts>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.plan({ page: 1, pageSize: 1 }),
      api.plan({ statusId: 0, page: 1, pageSize: 1 }),
      api.plan({ statusId: 1, page: 1, pageSize: 1 }),
      api.plan({ statusId: 2, page: 1, pageSize: 1 }),
      api.plan({ statusId: 3, page: 1, pageSize: 1 }),
    ])
      .then(([all, planned, inWork, done, fok]) => {
        if (!active) return;
        setCounts({ all: all.total, 0: planned.total, 1: inWork.total, 2: done.total, 3: fok.total });
      })
      .catch(() => {
        if (active) setCounts(null);
      });
    return () => {
      active = false;
    };
  }, []);

  return counts;
}
