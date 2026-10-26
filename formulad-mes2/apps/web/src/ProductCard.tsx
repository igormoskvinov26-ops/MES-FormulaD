import type { ProductionPlanItem } from './api';
import { dash, formatDate, statusBadge } from './format';

/** Карточка изделия. Только чтение: кнопок изменения состояния нет и не будет в MVP 0.1. */
export function ProductCard({ item }: { item: ProductionPlanItem }) {
  const badge = statusBadge(item.status);
  const rows: [string, string][] = [
    ['Модель', dash(item.modelName)],
    ['Артикул', dash(item.modelArticle)],
    ['Номер двигателя', dash(item.engineNumber)],
    ['Цвет', dash(item.color)],
    ['statusid', dash(item.statusId)],
    ['ID (справочно)', String(item.id)],
    ['Плановая отгрузка', formatDate(item.plannedShipmentDate)],
    ['Начало сборки', formatDate(item.startDate)],
    ['Завершение сборки', formatDate(item.completeDate)],
    ['ФОК', formatDate(item.fokDate)],
  ];

  return (
    <article className="card" aria-label={`Карточка изделия ${item.vin}`}>
      <h2 className="mono">{item.vin}</h2>
      <p>
        <span className={`badge status-${badge.tone}`} title={badge.title}>
          {badge.label}
        </span>
      </p>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="muted">Данные только для чтения (демо).</p>
    </article>
  );
}
