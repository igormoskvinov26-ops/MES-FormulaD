import type { ProductionPlanItem } from './api';
import { dash, formatDate, statusBadge } from './format';

/** Карточка изделия. Только чтение: кнопок изменения состояния нет и не будет в MVP 0.1.
    Печать JobCard и сводного NCP-листа — исключения (разделы 8, 15): это не переходы статуса,
    а печатные документы. */
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
    ['Порядок в плане', dash(item.seqn)],
    ['Модель', dash(item.modelArticle)],
    ['Наименование', dash(item.modelName)],
    ['Комплектация', dash(item.specificationName)],
    ['Номер двигателя', dash(item.engineNumber)],
    ['Цвет', dash(item.color)],
    ['statusid', dash(item.statusId)],
    ['ID (справочно)', String(item.id)],
    ['Напечатано', formatDate(item.printDate)],
    ['Старт · план', formatDate(item.plannedStartDate)],
    ['Завершение · план', formatDate(item.plannedCompleteDate)],
    ['Плановая отгрузка', formatDate(item.plannedShipmentDate)],
    ['Старт · факт', formatDate(item.startDate)],
    ['Завершение · факт', formatDate(item.completeDate)],
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
      {onPrint && (
        <button type="button" onClick={onPrint}>
          Печать JobCard
        </button>
      )}
      {onPrintNcpSummary && (
        <button type="button" onClick={onPrintNcpSummary}>
          Печать сводного NCP-листа
        </button>
      )}
      <p className="muted">Данные только для чтения (демо).</p>
    </article>
  );
}
