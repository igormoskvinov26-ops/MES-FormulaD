import { useEffect, useState } from 'react';
import type { Screen } from './AppHeader';
import { AppHeader } from './AppHeader';
import { api, type QcPost } from './api';
import { QcStepScreen } from './QcStepScreen';
import './f7-components.css';

export function QcScreen({
  session,
  onNavigate,
  onLogout,
}: {
  session: { userName: string | null; mode: string };
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
}) {
  const [posts, setPosts] = useState<QcPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [vin, setVin] = useState('');
  const [activePost, setActivePost] = useState<QcPost | null>(null);

  useEffect(() => {
    api.qcPosts()
      .then(setPosts)
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  if (activePost) {
    return (
      <QcStepScreen
        post={activePost}
        vin={vin}
        session={session}
        onNavigate={onNavigate}
        onLogout={onLogout}
        onBack={() => setActivePost(null)}
      />
    );
  }

  return (
    <div className="app f7plan">
      <AppHeader screen="qc" onNavigate={onNavigate} session={session} onLogout={onLogout} />

      <div className="f7plan__title">
        <span className="f7mes__slash" aria-hidden="true" />
        <div>
          <h1>КОНТРОЛЬНАЯ КАРТА КК</h1>
          <small>Пошаговая проверка по постам — 6 постов, 49 пунктов</small>
        </div>
      </div>

      <section className="toolbar">
        <div className="controls">
          <span className="f7plan__filters-label">VIN</span>
          <input
            className="search"
            aria-label="VIN изделия"
            placeholder="Введите VIN для начала проверки"
            value={vin}
            maxLength={50}
            onChange={(e) => setVin(e.target.value)}
          />
        </div>
      </section>

      <main className="content content-wide">
        <div className="qc-posts">
          {loading && <p className="f7plan__hint">Загрузка постов…</p>}
          {!loading && posts.length === 0 && <p className="f7plan__hint">Нет данных о постах.</p>}
          {posts.map((post) => (
            <button
              key={post.id}
              type="button"
              className={`qc-post-card ${post.todayComplete ? 'qc-post-done' : ''}`}
              disabled={!vin.trim()}
              title={vin.trim() ? undefined : 'Введите VIN для начала проверки'}
              onClick={() => setActivePost(post)}
            >
              <span className={`badge ${post.todayComplete ? 'status-done' : 'status-none'}`}>
                {post.todayComplete ? '✓ пройден' : 'не пройден'}
              </span>
              <span className="qc-post-name">{post.name}</span>
              {post.afterStation && (
                <span className="qc-post-station">после {post.afterStation}</span>
              )}
            </button>
          ))}
        </div>
        {!vin.trim() && posts.length > 0 && (
          <p className="f7plan__hint" style={{ marginTop: '1rem' }}>
            Введите VIN чтобы начать проверку по любому посту.
          </p>
        )}
      </main>
    </div>
  );
}
