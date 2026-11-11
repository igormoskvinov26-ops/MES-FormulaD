import { useCallback, useEffect, useRef, useState } from 'react';
import type { Screen } from './AppHeader';
import { ApiError, api, type Paged, type ProductionPlanItem } from './api';
import { PlanScreen } from './PlanScreen';
import { NcpScreen } from './NcpScreen';
import { StartScreen } from './StartScreen';
import { StationScreen } from './StationScreen';
import { CompleteScreen } from './CompleteScreen';
import { FokScreen } from './FokScreen';
import { ReworkScreen } from './ReworkScreen';
import { ImportScreen } from './ImportScreen';
import { IncomingInspectionScreen } from './IncomingInspectionScreen';
import { LoginScreen } from './LoginScreen';
import { ReportsScreen } from './ReportsScreen';
import { AdminScreen } from './AdminScreen';
import { BootScreen } from './Skeleton';
import { CommandPalette } from './CommandPalette';

type Session = { userName: string | null; mode: string } | null;

export function App() {
  const [session, setSession] = useState<Session>(null);
  const [checking, setChecking] = useState(true);
  const [screen, setScreen] = useState<Screen>('plan');

  const handleVinSearch = useCallback((_vin: string) => { setScreen('plan'); }, []);

  useEffect(() => {
    api
      .me()
      .then((me) => setSession({ userName: me.userName, mode: me.mode }))
      .catch(() => setSession(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return <BootScreen />;
  }

  if (!session) {
    return <LoginScreen onLoggedIn={(userName) => setSession({ userName, mode: 'dev' })} />;
  }

  const onLogout = () => setSession(null);

  const props = { session, onNavigate: setScreen, onLogout };
  let content: React.ReactNode;
  switch (screen) {
    case 'plan': content = <PlanScreen {...props} />; break;
    case 'import': content = <ImportScreen {...props} />; break;
    case 'start': content = <StartScreen {...props} />; break;
    case 'stations': content = <StationScreen {...props} />; break;
    case 'complete': content = <CompleteScreen {...props} />; break;
    case 'fok': content = <FokScreen {...props} />; break;
    case 'rework': content = <ReworkScreen {...props} />; break;
    case 'ncp': content = <NcpScreen {...props} />; break;
    case 'incoming': content = <IncomingInspectionScreen {...props} />; break;
    case 'reports': content = <ReportsScreen {...props} />; break;
    case 'admin': content = <AdminScreen {...props} />; break;
  }
  return <>{content}<CommandPalette onNavigate={setScreen} onVinSearch={handleVinSearch} /></>;
}

/** Загрузка страницы плана. Вынесено, чтобы PlanScreen оставался про разметку. */
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
  }, [vin, status, page, pageSize]);

  useEffect(reload, [reload]);

  return { data, state, error, reload };
}

export type PlanCounts = { all: number; 0: number; 1: number; 2: number; 3: number } | null;

/** Счётчики для плашек на экране плана — отдельные лёгкие запросы (pageSize=1, нужен только `total`),
    без изменений на сервере: statusId уже поддержан фильтром `/production-plan`. */
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
