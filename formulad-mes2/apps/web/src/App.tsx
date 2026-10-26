import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, type Paged, type ProductionPlanItem } from './api';
import { PlanScreen } from './PlanScreen';
import { LoginScreen } from './LoginScreen';

type Session = { userName: string | null; mode: string } | null;

export function App() {
  const [session, setSession] = useState<Session>(null);
  const [checking, setChecking] = useState(true);

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

  return session ? (
    <PlanScreen session={session} onLogout={() => setSession(null)} />
  ) : (
    <LoginScreen onLoggedIn={(userName) => setSession({ userName, mode: 'dev' })} />
  );
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
