import { useEffect, useState } from 'react';
import type { Screen } from './AppHeader';
import { AppHeader } from './AppHeader';
import { api, type QcPost, type QcSessionSummary } from './api';
import { formatDate } from './format';
import './f7-components.css';

type NodeKind = { kind: 'station'; name: string } | { kind: 'qc'; post: QcPost };

function buildRoute(stations: string[], posts: QcPost[]): NodeKind[] {
  const nodes: NodeKind[] = [];
  for (const name of stations) {
    nodes.push({ kind: 'station', name });
    const after = posts.filter((p) => p.afterStation === name);
    for (const post of after) nodes.push({ kind: 'qc', post });
  }
  for (const post of posts.filter((p) => p.afterStation === null)) {
    nodes.push({ kind: 'qc', post });
  }
  return nodes;
}

function outcomeColor(outcome: string | null): string {
  if (outcome === 'pass') return 'qc-node--pass';
  if (outcome === 'fail') return 'qc-node--fail';
  return 'qc-node--pending';
}

function outcomeLabel(outcome: string | null): string {
  if (outcome === 'pass') return 'Пройден';
  if (outcome === 'fail') return 'Не пройден';
  return 'Нет данных';
}

export function LineMapScreen({
  session,
  onNavigate,
  onLogout,
}: {
  session: { userName: string | null; mode: string };
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
}) {
  const [stations, setStations] = useState<string[]>([]);
  const [posts, setPosts] = useState<QcPost[]>([]);
  const [loadError, setLoadError] = useState('');

  const [selectedPost, setSelectedPost] = useState<QcPost | null>(null);
  const [history, setHistory] = useState<QcSessionSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    Promise.all([api.ncpStations(), api.qcPosts()])
      .then(([st, ps]) => { setStations(st); setPosts(ps); })
      .catch(() => setLoadError('Не удалось загрузить данные линии'));
  }, []);

  async function selectPost(post: QcPost) {
    setSelectedPost(post);
    setHistoryError('');
    setHistoryLoading(true);
    try {
      setHistory(await api.qcPostSessions(post.id, 20));
    } catch {
      setHistoryError('Не удалось загрузить историю сессий');
    } finally {
      setHistoryLoading(false);
    }
  }

  const route = buildRoute(stations, posts);

  function lastOutcome(post: QcPost): string | null {
    if (selectedPost?.id === post.id && history.length > 0) return history[0].outcome;
    if (post.todayComplete) return 'pass';
    return null;
  }

  return (
    <div className="app f7plan">
      <AppHeader screen="lineMap" onNavigate={onNavigate} session={session} onLogout={onLogout} />

      <div className="f7plan__scanbar">
        <div className="f7plan__title f7plan__title--inline">
          <span className="f7mes__slash" aria-hidden="true" />
          <div>
            <h1>КАРТА ЛИНИИ</h1>
            <small>Сборочные станции и QC-посты в порядке маршрута; цвет — статус последней проверки</small>
          </div>
        </div>
      </div>

      {loadError && <p role="alert" className="error" style={{ margin: '12px 18px' }}>{loadError}</p>}

      <main className="content content-wide">
        <div className="line-map" aria-label="Схема производственной линии" role="list">
          {route.map((node, i) => {
            if (node.kind === 'station') {
              return (
                <div key={`st-${node.name}`} className="line-map-node line-map-node--station" role="listitem">
                  <span className="line-map-label">{node.name}</span>
                  {i < route.length - 1 && <span className="line-map-connector" aria-hidden="true" />}
                </div>
              );
            }
            const { post } = node;
            const colorClass = lastOutcome(post) !== undefined ? outcomeColor(lastOutcome(post)) : 'qc-node--pending';
            return (
              <div key={`qc-${post.id}`} className="line-map-node line-map-node--qc" role="listitem">
                <button
                  type="button"
                  className={`qc-node ${colorClass}`}
                  aria-label={`${post.name} — ${outcomeLabel(lastOutcome(post))}`}
                  aria-pressed={selectedPost?.id === post.id}
                  onClick={() => void selectPost(post)}
                >
                  <span className="qc-node-name">{post.name}</span>
                  <span className="qc-node-status">{outcomeLabel(lastOutcome(post))}</span>
                </button>
                {i < route.length - 1 && <span className="line-map-connector" aria-hidden="true" />}
              </div>
            );
          })}
        </div>

        <div className="line-map-legend">
          <span className="qc-node qc-node--pass qc-node--demo">Пройден</span>
          <span className="qc-node qc-node--fail qc-node--demo">Не пройден</span>
          <span className="qc-node qc-node--pending qc-node--demo">Нет данных</span>
        </div>

        {selectedPost && (
          <div className="card line-map-history">
            <h2>История: {selectedPost.name}</h2>
            {historyLoading && <p className="muted">Загрузка…</p>}
            {historyError && <p role="alert" className="error">{historyError}</p>}
            {!historyLoading && !historyError && history.length === 0 && <p className="muted">Сессий ещё не было</p>}
            {!historyLoading && history.length > 0 && (
              <table>
                <thead><tr><th>VIN</th><th>Начало</th><th>Завершение</th><th>Итог</th><th>Инспектор</th></tr></thead>
                <tbody>
                  {history.map((s) => (
                    <tr key={s.id}>
                      <td className="mono vin">{s.vin}</td>
                      <td>{formatDate(s.startedAt)}</td>
                      <td>{s.finishedAt ? formatDate(s.finishedAt) : '—'}</td>
                      <td>
                        <span className={`badge ${s.outcome === 'pass' ? 'badge-ok' : s.outcome === 'fail' ? 'badge-err' : ''}`}>
                          {outcomeLabel(s.outcome)}
                        </span>
                      </td>
                      <td>{s.startedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
