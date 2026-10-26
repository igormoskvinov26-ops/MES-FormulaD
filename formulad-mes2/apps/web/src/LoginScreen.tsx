import { useState } from 'react';
import { ApiError, api } from './api';

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
      <form onSubmit={submit} className="card">
        <h1>FormulaD MES 2.0</h1>
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
        <button type="submit" disabled={busy}>
          {busy ? 'Вход…' : 'Войти'}
        </button>
      </form>
    </main>
  );
}
