import type { NcpItem, ProductionPlanItem } from './api';
import { dash } from './format';

/**
 * Сводный NCP-лист по VIN (раздел 15, [С]): объединяет расхождения со всех станций изделия —
 * не то же самое, что бирка одной детали (NcpSheet.tsx). Печатается после прохождения
 * производственных станций, поэтому включает и закрытые заявки — история не прячется.
 */
export function NcpSummarySheet({ vin, plan, items, formedAt }: { vin: string; plan: ProductionPlanItem | null; items: NcpItem[]; formedAt: string }) {
  const byStation = [...items].sort((a, b) => a.station.localeCompare(b.station, 'ru'));

  return (
    <article className="ncp-sheet">
      <header className="jobcard-head">
        <span className="logo">
          F<span className="logo-mark">7</span>
          <span className="logo-suffix">MES</span>
        </span>
        <span className="jobcard-title">Сводный NCP-лист</span>
      </header>

      <h2 className="mono jobcard-vin">{vin}</h2>
      <p className="muted">
        {dash(plan?.modelName ?? plan?.modelArticle ?? null)} · Производственный номер: {plan ? plan.id : '—'}
      </p>

      {byStation.length === 0 ? (
        <p>По изделию несоответствий не зарегистрировано.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Номер</th>
              <th scope="col">Станция</th>
              <th scope="col">Деталь</th>
              <th scope="col">Кол-во</th>
              <th scope="col">Тип</th>
              <th scope="col">Статус</th>
              <th scope="col">Установка</th>
            </tr>
          </thead>
          <tbody>
            {byStation.map((item) => (
              <tr key={item.id}>
                <td className="mono">{item.number}</td>
                <td>{item.station}</td>
                <td>{item.componentName}</td>
                <td>{item.quantity}</td>
                <td>{item.type}</td>
                <td>{item.status}</td>
                <td>{item.partInstalled ? 'установлена' : 'не установлена'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="jobcard-foot">Дата формирования: {formedAt}</p>
    </article>
  );
}
