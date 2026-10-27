import { useEffect, useState } from 'react';
import { usePlanCounts } from './App';
import type { Screen } from './AppHeader';
import { AppHeader } from './AppHeader';
import { api, type Delivery, type NcpItem } from './api';
import { statusCodeLabel } from './format';

type NcpSummary = { total: number; open: number; closed: number; byType: Record<string, number> };
type IncomingSummary = { deliveries: number; open: number; verified: number; verifiedWithIssues: number; defect: number; mismatch: number; shortage: number };

function summarizeNcp(items: NcpItem[]): NcpSummary {
  const byType: Record<string, number> = {};
  let open = 0;
  for (const item of items) {
    byType[item.type] = (byType[item.type] ?? 0) + 1;
    if (item.status !== 'Закрыто') open += 1;
  }
  return { total: items.length, open, closed: items.length - open, byType };
}

function summarizeIncoming(deliveries: Delivery[]): IncomingSummary {
  const summary: IncomingSummary = { deliveries: deliveries.length, open: 0, verified: 0, verifiedWithIssues: 0, defect: 0, mismatch: 0, shortage: 0 };
  for (const delivery of deliveries) {
    if (delivery.status === 'Open') summary.open += 1;
    else if (delivery.status === 'Verified') summary.verified += 1;
    else summary.verifiedWithIssues += 1;
    for (const pkg of delivery.packages) {
      for (const row of pkg.rows) {
        summary.defect += row.defectQuantity;
        summary.mismatch += row.mismatchQuantity;
        summary.shortage += row.shortageQuantity;
      }
    }
  }
  return summary;
}

/**
 * Отчётность (раздел 26, Этап 10): сводки по тем срезам, которые реально существуют в системе.
 * «Сколько изделий на каждой станции» из [П] сознательно не делаю — в модели нет поля «изделие
 * сейчас физически на станции N» (экран «Станции» — это чек-лист компонентов по VIN, а не трекер
 * местоположения); отчёты за период тоже не делаю — [В-35] прямо говорит, что обязательный
 * комплект выгрузок не согласован. Здесь — агрегаты по уже существующим данным: план (переиспользует
 * тот же счётчик, что плашки экрана плана), NCP, входной контроль.
 */
export function ReportsScreen({
  session,
  onNavigate,
  onLogout,
}: {
  session: { userName: string | null; mode: string };
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
}) {
  const planCounts = usePlanCounts();
  const [reworkCount, setReworkCount] = useState<number | null>(null);
  const [ncp, setNcp] = useState<NcpSummary | null>(null);
  const [incoming, setIncoming] = useState<IncomingSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.plan({ statusId: 4, page: 1, pageSize: 1 }).then((p) => setReworkCount(p.total)).catch(() => setReworkCount(null));
    api
      .ncpList({ page: 1, pageSize: 100 })
      .then((p) => setNcp(summarizeNcp(p.items)))
      .catch(() => setError('Нет связи с сервером'));
    api
      .deliveries(1, 100)
      .then((p) => setIncoming(summarizeIncoming(p.items)))
      .catch(() => setError('Нет связи с сервером'));
  }, []);

  return (
    <div className="app">
      <AppHeader screen="reports" onNavigate={onNavigate} session={session} onLogout={onLogout} />
      <section className="toolbar">
        <h1>Отчётность</h1>
      </section>

      {error && (
        <p role="alert" className="error" style={{ margin: '12px 18px 0' }}>
          {error}
        </p>
      )}

      <main className="content content-wide reports-grid">
        <article className="card">
          <h2>Производственный план</h2>
          {planCounts ? (
            <dl>
              <div><dt>Всего в плане</dt><dd>{planCounts.all}</dd></div>
              <div><dt>{statusCodeLabel(0)}</dt><dd>{planCounts[0]}</dd></div>
              <div><dt>{statusCodeLabel(1)}</dt><dd>{planCounts[1]}</dd></div>
              <div><dt>{statusCodeLabel(2)}</dt><dd>{planCounts[2]}</dd></div>
              <div><dt>{statusCodeLabel(3)}</dt><dd>{planCounts[3]}</dd></div>
              <div><dt>{statusCodeLabel(4)}</dt><dd>{reworkCount ?? '—'}</dd></div>
            </dl>
          ) : (
            <p className="muted">Загрузка…</p>
          )}
        </article>

        <article className="card">
          <h2>Несоответствия (NCP)</h2>
          {ncp ? (
            <>
              <dl>
                <div><dt>Всего</dt><dd>{ncp.total}</dd></div>
                <div><dt>Открыто</dt><dd>{ncp.open}</dd></div>
                <div><dt>Закрыто</dt><dd>{ncp.closed}</dd></div>
              </dl>
              <h3>По типу</h3>
              <dl>
                {Object.entries(ncp.byType).map(([type, count]) => (
                  <div key={type}><dt>{type}</dt><dd>{count}</dd></div>
                ))}
              </dl>
            </>
          ) : (
            <p className="muted">Загрузка…</p>
          )}
        </article>

        <article className="card">
          <h2>Входной контроль</h2>
          {incoming ? (
            <dl>
              <div><dt>Поставок</dt><dd>{incoming.deliveries}</dd></div>
              <div><dt>В работе</dt><dd>{incoming.open}</dd></div>
              <div><dt>Проверено</dt><dd>{incoming.verified}</dd></div>
              <div><dt>Проверено, с замечаниями</dt><dd>{incoming.verifiedWithIssues}</dd></div>
              <div><dt>Брак (шт.)</dt><dd>{incoming.defect}</dd></div>
              <div><dt>Пересорт (шт.)</dt><dd>{incoming.mismatch}</dd></div>
              <div><dt>Недостача (шт.)</dt><dd>{incoming.shortage}</dd></div>
            </dl>
          ) : (
            <p className="muted">Загрузка…</p>
          )}
        </article>
      </main>
    </div>
  );
}
