import type { NcpItem, ProductionPlanItem } from './api';
import { dash, formatDate } from './format';

export function NcpSheet({ item, plan, formedAt }: { item: NcpItem; plan: ProductionPlanItem | null; formedAt: string }) {
  const rows: [string, string][] = [
    ['VIN', item.vin],
    ['Модель', dash(plan?.modelName ?? plan?.modelArticle ?? null)],
    ['Производственный номер', plan ? String(plan.id) : '—'],
    ['Станция', item.station],
    ['Артикул детали', item.componentCode],
    ['Наименование детали', item.componentName],
    ['Количество', String(item.quantity)],
    ['Характер расхождения', item.type],
    ['Зарегистрировано', `${formatDate(item.createdAt)} · ${item.createdBy}`],
    ['Состояние установки', item.partInstalled ? 'Деталь установлена/заменена' : 'Деталь не установлена'],
  ];

  return (
    <article className="ncp-sheet">
      <header className="jobcard-head">
        <span className="logo">
          F<span className="logo-mark">7</span>
          <span className="logo-suffix">MES</span>
        </span>
        <span className="jobcard-title">NCP-лист · Red Table</span>
      </header>

      <h2 className="mono jobcard-vin">{item.number}</h2>

      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {item.operatorComment && (
        <p className="ncp-sheet-comment">
          <strong>Комментарий оператора:</strong> {item.operatorComment}
        </p>
      )}

      <p className="jobcard-foot">Дата формирования: {formedAt}</p>
    </article>
  );
}
