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
import { LoginScreen } from './LoginScreen';

type Session = { userName: string | null; mode: string } | null;

export function App() {
  const [session, setSession] = useState<Session>(null);
  const [checking, setChecking] = useState(true);
  const [screen, setScreen] = useState<Screen>('plan');

  useEffect(() => {
    api
      .me()
      .then((me) => setSession({ userName: me.userName, mode: me.mode }))
      .catch(() => setSession(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return <p className="center muted">Загрузка…</p>;
  }

  if (!session) {
    return <LoginScreen onLoggedIn={(userName) => setSession({ userName, mode: 'dev' })} />;
  }

  const onLogout = () => setSession(null);

  switch (screen) {
    case 'plan':
      return <PlanScreen session={session} onNavigate={setScreen} onLogout={onLogout} />;
    case 'import':
      return <ImportScreen session={session} onNavigate={setScreen} onLogout={onLogout} />;
    case 'start':
      return <StartScreen session={session} onNavigate={setScreen} onLogout={onLogout} />;
    case 'stations':
      return <StationScreen session={session} onNavigate={setScreen} onLogout={onLogout} />;
    case 'complete':
      return <CompleteScreen session={session} onNavigate={setScreen} onLogout={onLogout} />;
    case 'fok':
      return <FokScreen session={session} onNavigate={setScreen} onLogout={onLogout} />;
    case 'rework':
      return <ReworkScreen session={session} onNavigate={setScreen} onLogout={onLogout} />;
    case 'ncp':
      return <NcpScreen session={session} onNavigate={setScreen} onLogout={onLogout} />;
  }
}

/** Загрузка страницы плана. Вынесено, чтобы PlanScreen оставался про разметку. */
export function usePlan(vin: string, status: string | null, page: number, pageSize: number) {
  const [data, setData] = useState<Paged<ProductionPlanItem> | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string>('');
  const requestId = useRef(0);

  const reload = useCallback(() => {
    const id = ++requestId.current;
    setState('loading');
    api
      .plan({ vin, status, page, pageSize })
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
