import { useEffect, useRef, useState } from 'react';
import type { Screen } from './AppHeader';
import { AppHeader } from './AppHeader';
import { api, type ChecklistItem, type QcPost, type QcResultItem, type QcSession } from './api';
import './f7-components.css';

type StepStatus = 'pass' | 'fail' | 'skip' | null;

function statusLabel(s: StepStatus) {
  if (s === 'pass') return '✓ OK';
  if (s === 'fail') return '✗ Брак';
  if (s === 'skip') return '— Пропуск';
  return '';
}

function statusClass(s: StepStatus) {
  if (s === 'pass') return 'status-ok';
  if (s === 'fail') return 'status-none';
  if (s === 'skip') return 'status-info';
  return '';
}

export function QcStepScreen({
  post,
  vin,
  session,
  onNavigate,
  onLogout,
  onBack,
}: {
  post: QcPost;
  vin: string;
  session: { userName: string | null; mode: string };
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
  onBack: () => void;
}) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [qcSession, setQcSession] = useState<QcSession | null>(null);
  const [results, setResults] = useState<Map<number, QcResultItem>>(new Map());
  const [cursor, setCursor] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setBusy(true);
      setError('');
      try {
        const [fetchedItems, started] = await Promise.all([
          api.qcItems(post.id),
          api.qcStartSession(post.id, vin),
        ]);
        if (cancelled) return;
        setItems(fetchedItems);
        setQcSession(started);
      } catch {
        if (!cancelled) setError('Не удалось загрузить данные или начать сессию.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void init();
    return () => { cancelled = true; };
  }, [post.id, vin]);

  useEffect(() => {
    scanRef.current?.focus();
  }, [cursor]);

  async function record(status: StepStatus) {
    if (!qcSession || !items[cursor] || busy || !status) return;
    const item = items[cursor];
    setBusy(true);
    setError('');
    try {
      const result = await api.qcRecordResult(qcSession.id, item.id, status, comment.trim() || null);
      setResults((prev) => new Map(prev).set(item.id, result));
      setComment('');
      if (cursor < items.length - 1) {
        setCursor((c) => c + 1);
      } else {
        const outcome = [...results.values(), result].some((r) => r.status === 'fail') ? 'fail' : 'pass';
        await api.qcFinishSession(qcSession.id, outcome);
        setDone(true);
      }
    } catch {
      setError('Не удалось записать результат.');
    } finally {
      setBusy(false);
    }
  }

  function handleScan(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') void record('pass');
  }

  const item = items[cursor];
  const totalItems = items.length;
  const doneCount = results.size;

  if (error && !items.length) {
    return (
      <div className="app f7plan">
        <AppHeader screen="qc" onNavigate={onNavigate} session={session} onLogout={onLogout} />
        <main className="content content-wide">
          <p role="alert" className="error">{error}</p>
          <button type="button" className="ghost" onClick={onBack}>← Назад к постам</button>
        </main>
      </div>
    );
  }

  if (done) {
    const passCount = [...results.values()].filter((r) => r.status === 'pass').length;
    const failCount = [...results.values()].filter((r) => r.status === 'fail').length;
    const skipCount = [...results.values()].filter((r) => r.status === 'skip').length;
    const outcome = failCount > 0 ? 'fail' : 'pass';
    return (
      <div className="app f7plan">
        <AppHeader screen="qc" onNavigate={onNavigate} session={session} onLogout={onLogout} />
        <div className="f7plan__title">
          <span className="f7mes__slash" aria-hidden="true" />
          <div>
            <h1>{post.name}</h1>
            <small>VIN: {vin}</small>
          </div>
        </div>
        <main className="content content-wide">
          <div className="qc-done">
            <span className={`badge ${outcome === 'pass' ? 'status-ok' : 'status-none'}`} style={{ fontSize: '1.1rem', padding: '6px 16px' }}>
              {outcome === 'pass' ? '✓ Проверка пройдена' : '✗ Выявлены несоответствия'}
            </span>
            <table style={{ marginTop: '1.5rem', width: '100%', maxWidth: 480 }}>
              <tbody>
                <tr><td>OK</td><td><strong>{passCount}</strong></td></tr>
                <tr><td>Брак</td><td><strong>{failCount}</strong></td></tr>
                <tr><td>Пропущено</td><td><strong>{skipCount}</strong></td></tr>
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 12, marginTop: '2rem' }}>
              <button type="button" className="primary" onClick={onBack}>К списку постов</button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app f7plan">
      <AppHeader screen="qc" onNavigate={onNavigate} session={session} onLogout={onLogout} />

      <div className="f7plan__title">
        <span className="f7mes__slash" aria-hidden="true" />
        <div>
          <h1>{post.name}</h1>
          <small>VIN: {vin}</small>
        </div>
      </div>

      <main className="content content-wide">
        {busy && !item && <p className="f7plan__hint">Загрузка…</p>}

        {item && (
          <div className="qc-step">
            <div className="qc-progress">
              <span className="qc-progress-label">{cursor + 1} / {totalItems}</span>
              <div className="qc-progress-bar">
                <div className="qc-progress-fill" style={{ width: `${(doneCount / totalItems) * 100}%` }} />
              </div>
            </div>

            <div className="qc-item-card">
              <div className="qc-item-seq">Пункт {item.seq}</div>
              <div className="qc-item-desc">{item.description}</div>

              <input
                ref={scanRef}
                className="qc-scan-input"
                placeholder="Сканировать штрихкод или нажать Enter = OK"
                value=""
                onChange={() => undefined}
                onKeyDown={handleScan}
                aria-label="Сканировать штрихкод"
                disabled={busy}
              />

              <textarea
                className="qc-comment-input"
                placeholder="Комментарий (необязательно)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                disabled={busy}
              />

              <div className="qc-actions">
                <button type="button" className="qc-btn qc-btn-pass" onClick={() => void record('pass')} disabled={busy}>
                  ✓ OK / Пройдено
                </button>
                <button type="button" className="qc-btn qc-btn-fail" onClick={() => void record('fail')} disabled={busy}>
                  ✗ Брак
                </button>
                <button type="button" className="qc-btn qc-btn-skip" onClick={() => void record('skip')} disabled={busy}>
                  — Пропустить
                </button>
              </div>

              {error && <p role="alert" className="error">{error}</p>}
            </div>

            {results.size > 0 && (
              <div className="qc-history">
                <h3 className="qc-history-title">Пройдено</h3>
                <ul className="qc-history-list">
                  {items.slice(0, cursor).map((it) => {
                    const r = results.get(it.id);
                    return (
                      <li key={it.id} className="qc-history-item">
                        <span className={`badge ${r ? statusClass(r.status as StepStatus) : ''}`}>
                          {r ? statusLabel(r.status as StepStatus) : '…'}
                        </span>
                        <span className="qc-history-desc">{it.seq}. {it.description}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        <button type="button" className="ghost" style={{ marginTop: '1rem' }} onClick={onBack} disabled={busy}>
          ← Назад к постам
        </button>
      </main>
    </div>
  );
}
