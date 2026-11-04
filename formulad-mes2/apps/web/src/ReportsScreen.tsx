import { useEffect, useState } from 'react';
import { usePlanCounts } from './App';
import type { Screen } from './AppHeader';
import { AppHeader } from './AppHeader';
import { api, type Delivery, type NcpItem } from './api';
import { statusCodeLabel } from './format';
import { LinesSkeleton } from './Skeleton';

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

type StackPart = { key: string; name: string; value: number; tone: string };

/**
 * Полоса распределения: доли видны сразу, без библиотеки графиков. Цифры остаются в списках рядом, а сама полоса
 * для скринридера — одна картинка с текстовым описанием (в сегментах нет текста).
 */
function StackBar({ label, parts }: { label: string; parts: StackPart[] }) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  const description = parts.map((p) => `${p.name} ${p.value}`).join(', ');
  return (
    <div className="rep-stack" role="img" aria-label={`${label}: ${description}`}>
      {total === 0 ? (
        <i className="rep-seg rep-seg--empty" style={{ flexGrow: 1 }} />
      ) : (
        parts.filter((p) => p.value > 0).map((p) => (
          <i key={p.key} className={`rep-seg rep-seg--${p.tone}`} style={{ flexGrow: p.value }} title={`${p.name}: ${p.value}`} />
        ))
      )}
    </div>
  );
}

/** Строка «подпись — полоса — число»: длина полосы пропорциональна максимуму в группе. */
function BarLine({ label, value, max, tone, alert = false }: { label: string; value: number; max: number; tone?: string; alert?: boolean }) {
  return (
    <div className={`rep-line${alert ? ' rep-line--alert' : ''}`}>
      <dt>{label}</dt>
      <span className="rep-line__track" aria-hidden="true">
        <i className={tone ? `rep-line__fill rep-seg--${tone}` : 'rep-line__fill'} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </span>
      <dd>{value}</dd>
    </div>
  );
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

  const planStatuses: { id: 0 | 1 | 2 | 3; tone: string }[] = [
    { id: 0, tone: 'waiting' },
    { id: 1, tone: 'in-work' },
    { id: 2, tone: 'complete' },
    { id: 3, tone: 'fok' },
  ];
  const typeEntries = ncp ? Object.entries(ncp.byType).sort((a, b) => b[1] - a[1]) : [];
  const typeMax = typeEntries.reduce((m, [, n]) => Math.max(m, n), 0);
  const incomingMax = incoming ? Math.max(incoming.defect, incoming.mismatch, incoming.shortage) : 0;

  return (
    <div className="app f7plan">
      <AppHeader screen="reports" onNavigate={onNavigate} session={session} onLogout={onLogout} />

      <div className="f7plan__title">
        <span className="f7mes__slash" aria-hidden="true" />
        <div>
          <h1>ОТЧЁТНОСТЬ</h1>
          <small>Сводки по плану, несоответствиям и входному контролю</small>
        </div>
      </div>

      {error && (
        <p role="alert" className="error" style={{ margin: '12px 24px 0' }}>
          {error}
        </p>
      )}

      <main className="rep-grid">
        <article className="rep-card">
          <h2>Производственный план</h2>
          {planCounts ? (
            <>
              <p className="rep-hero">{planCounts.all}</p>
              <p className="rep-caption">изделий в плане</p>
              <StackBar
                label="Распределение плана по статусам"
                parts={[
                  ...planStatuses.map((st) => ({ key: String(st.id), name: statusCodeLabel(st.id), value: planCounts[st.id], tone: st.tone })),
                  { key: '4', name: statusCodeLabel(4), value: reworkCount ?? 0, tone: 'rework' },
                ]}
              />
              <dl className="rep-lines">
                {planStatuses.map((st) => (
                  <div key={st.id} className="rep-line">
                    <dt><i className={`rep-dot rep-seg--${st.tone}`} aria-hidden="true" />{statusCodeLabel(st.id)}</dt>
                    <dd className={`state-${st.tone}`}>{planCounts[st.id]}</dd>
                  </div>
                ))}
                <div className="rep-line">
                  <dt><i className="rep-dot rep-seg--rework" aria-hidden="true" />{statusCodeLabel(4)}</dt>
                  <dd>{reworkCount ?? '—'}</dd>
                </div>
              </dl>
            </>
          ) : (
            <LinesSkeleton />
          )}
        </article>

        <article className="rep-card">
          <h2>Несоответствия (NCP)</h2>
          {ncp ? (
            <>
              <div className="rep-kpis">
                <div className="rep-kpi"><strong>{ncp.total}</strong><span>всего</span></div>
                <div className="rep-kpi rep-kpi--warn"><strong>{ncp.open}</strong><span>открыто</span></div>
                <div className="rep-kpi rep-kpi--ok"><strong>{ncp.closed}</strong><span>закрыто</span></div>
              </div>
              <StackBar
                label="Несоответствия по состоянию"
                parts={[
                  { key: 'open', name: 'Открыто', value: ncp.open, tone: 'waiting' },
                  { key: 'closed', name: 'Закрыто', value: ncp.closed, tone: 'in-work' },
                ]}
              />
              <h3>По типу</h3>
              <dl className="rep-lines">
                {typeEntries.map(([type, count]) => (
                  <BarLine key={type} label={type} value={count} max={typeMax} tone="complete" />
                ))}
              </dl>
            </>
          ) : (
            <LinesSkeleton />
          )}
        </article>

        <article className="rep-card">
          <h2>Входной контроль</h2>
          {incoming ? (
            <>
              <div className="rep-kpis">
                <div className="rep-kpi"><strong>{incoming.deliveries}</strong><span>поставок</span></div>
                <div className="rep-kpi rep-kpi--ok"><strong>{incoming.verified}</strong><span>проверено</span></div>
                <div className="rep-kpi rep-kpi--warn"><strong>{incoming.verifiedWithIssues}</strong><span>с замеч.</span></div>
              </div>
              <StackBar
                label="Поставки по состоянию"
                parts={[
                  { key: 'verified', name: 'Проверено', value: incoming.verified, tone: 'in-work' },
                  { key: 'issues', name: 'С замечаниями', value: incoming.verifiedWithIssues, tone: 'waiting' },
                  { key: 'open', name: 'В работе', value: incoming.open, tone: 'complete' },
                ]}
              />
              <dl className="rep-lines">
                <div className="rep-line"><dt>В работе</dt><dd>{incoming.open}</dd></div>
                <BarLine label="Брак (шт.)" value={incoming.defect} max={incomingMax} tone="rework" alert={incoming.defect > 0} />
                <BarLine label="Пересорт (шт.)" value={incoming.mismatch} max={incomingMax} tone="waiting" />
                <BarLine label="Недостача (шт.)" value={incoming.shortage} max={incomingMax} tone="waiting" />
              </dl>
            </>
          ) : (
            <LinesSkeleton />
          )}
        </article>
      </main>
    </div>
  );
}
