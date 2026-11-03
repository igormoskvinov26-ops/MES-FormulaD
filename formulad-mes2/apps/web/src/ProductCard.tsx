import type { ProductionPlanItem } from './api';
import { dash, formatDate, statusBadge } from './format';

export function ProductCard({
  item,
  onPrint,
  onPrintNcpSummary,
}: {
  item: ProductionPlanItem;
  onPrint?: () => void;
  onPrintNcpSummary?: () => void;
}) {
  const badge = statusBadge(item.status);
  const rows: [string, string][] = [
    ['Порядок', dash(item.seqn)],
    ['Модель', dash(item.modelArticle)],
    ['Наименование', dash(item.modelName)],
    ['Комплектация', dash(item.specificationName)],
    ['Двигатель', dash(item.engineNumber)],
    ['Цвет', dash(item.color)],
    ['Старт · план', formatDate(item.plannedStartDate)],
    ['Завершение · план', formatDate(item.plannedCompleteDate)],
    ['Отгрузка · план', formatDate(item.plannedShipmentDate)],
    ['Старт · факт', formatDate(item.startDate)],
    ['Завершение · факт', formatDate(item.completeDate)],
    ['ФОК', formatDate(item.fokDate)],
  ];

  return (
    <article className="card" aria-label={`Карточка изделия ${item.vin}`}>
      <h2 className="mono" style={{ fontSize: 18, margin: '0 0 4px' }}>{item.vin}</h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <span className={`badge status-${badge.tone}`} title={badge.title}>{badge.label}</span>
        {onPrint && <button type="button" style={{ padding: '4px 10px', fontSize: 13 }} onClick={onPrint}>Печать</button>}
        {onPrintNcpSummary && <button type="button" style={{ padding: '4px 10px', fontSize: 13 }} onClick={onPrintNcpSummary}>NCP-лист</button>}
      </div>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
