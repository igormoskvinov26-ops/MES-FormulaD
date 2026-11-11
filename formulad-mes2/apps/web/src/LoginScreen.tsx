import { useState } from 'react';
import { ApiError, api } from './api';

export function LoginScreen({ onLoggedIn }: { onLoggedIn: (userName: string) => void }) {
  const [login, setLogin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.login(login);
      onLoggedIn(result.userName);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 404
          ? 'Вход формой выключен: на этом сервере пользователь определяется учётной записью Windows.'
          : 'Пользователь не найден или отключён.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <section className="login-hero" aria-hidden="true">
        <div className="login-hero-brand">
          <img className="login-hero-logo" src="/f7-logo.png" alt="" />
          <p className="login-hero-tagline">Производственная система Formula 7 — учёт сборки квадроциклов от плана до FOK.</p>
        </div>
        <img className="login-hero-atv" src="/atv-hero.png" alt="" />
        <p className="login-hero-foot">Formula 7 · Производство ATV</p>
      </section>
      <div className="login-card">
        <form onSubmit={submit} className="card">
          <h1>Вход в систему</h1>
          <p className="muted">
            Тестовый стенд: укажите логин из справочника пользователей. На рабочем сервере
            пользователь определяется учётной записью Windows автоматически.
          </p>
          <label>
            Пользователь
            <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
          </label>
          {error && <p role="alert" className="error">{error}</p>}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Вход…' : 'Войти'}
          </button>
        </form>
      </div>
    </main>
  );
}
