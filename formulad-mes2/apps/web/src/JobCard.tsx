import type { ProductionPlanItem } from './api';
import { dash } from './format';
import { Qr } from './Qr';

export function JobCard({ item, formedAt }: { item: ProductionPlanItem; formedAt: string }) {
  const rows: [string, string][] = [
    ['Производственный номер', String(item.id)],
    ['Модель', dash(item.modelName ?? item.modelArticle)],
    ['Комплектация', dash(item.specificationName)],
    ['Цвет', dash(item.color)],
    ['№ двигателя', dash(item.engineNumber)],
    ['№ шасси', dash(item.chassisNumber ?? null)],
    ['Позиция плана', dash(item.seqn)],
  ];

  return (
    <article className="jobcard">
      <header className="jobcard-head">
        <span className="logo">
          F<span className="logo-mark">7</span>
          <span className="logo-suffix">MES</span>
        </span>
        <span className="jobcard-title">JobCard</span>
      </header>

      <h2 className="mono jobcard-vin">{item.vin}</h2>

      <div className="jobcard-body">
        <dl>
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <Qr value={item.vin} size={110} />
      </div>

      <p className="jobcard-foot">Дата формирования: {formedAt}</p>
    </article>
  );
}
