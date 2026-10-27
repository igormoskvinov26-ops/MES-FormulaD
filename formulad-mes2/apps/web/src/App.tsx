import { useCallback, useEffect, useRef, useState } from 'react';
import type { Screen } from './AppHeader';
import { ApiError, api, type Paged, type ProductionPlanItem } from './api';
import { PlanScreen } from './PlanScreen';
import { NcpScreen } from './NcpScreen';
import { StartScreen } from './StartScreen';
import { CompleteScreen } from './CompleteScreen';
import { FokScreen } from './FokScreen';
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
    case 'start':
      return <StartScreen session={session} onNavigate={setScreen} onLogout={onLogout} />;
    case 'complete':
      return <CompleteScreen session={session} onNavigate={setScreen} onLogout={onLogout} />;
    case 'fok':
      return <FokScreen session={session} onNavigate={setScreen} onLogout={onLogout} />;
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
