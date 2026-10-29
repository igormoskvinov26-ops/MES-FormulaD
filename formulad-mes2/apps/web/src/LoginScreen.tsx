import { useState } from 'react';
import { ApiError, api } from './api';
import { QuadMark } from './QuadMark';

export function LoginScreen({ onLoggedIn }: { onLoggedIn: (userName: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.login(username, password);
      onLoggedIn(result.userName);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 404
          ? 'Dev-вход не включён на сервере. Это нормальный режим вне локальной разработки.'
          : 'Неверные учётные данные или сервер недоступен.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <section className="login-hero" aria-hidden="true">
        <div className="login-hero-brand">
          <QuadMark className="login-hero-icon" />
          <p className="logo">
            F<span className="logo-mark">7</span>
            <span className="logo-suffix">MES</span>
          </p>
          <p className="login-hero-tagline">Производственная система Formula 7 — учёт сборки квадроциклов от плана до FOK.</p>
        </div>
        <p className="login-hero-foot">Formula 7 · Производство ATV</p>
      </section>
      <div className="login-card">
        <form onSubmit={submit} className="card">
          <h1>Вход в систему</h1>
          <p className="muted">
            Локальный демонстрационный вход. Учётные данные задаются через переменные среды или user-secrets.
          </p>
          <label>
            Пользователь
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </label>
          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
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
