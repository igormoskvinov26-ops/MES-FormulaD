import { useState } from 'react';
import type { NcpItem } from './api';
import { dash, formatDate } from './format';

/**
 * Карточка несоответствия. Статус заявки и признак «деталь установлена» — РАЗНЫЕ поля
 * (раздел 16 спецификации), поэтому и действия над ними разные кнопки, не одна.
 */
export function NcpDetails({
  item,
  onSetPartInstalled,
  onClose,
  onPrint,
}: {
  item: NcpItem;
  onSetPartInstalled: (installed: boolean) => void;
  onClose: (engineerComment: string | null) => void;
  /** Печать индивидуального NCP-листа для Red Table (раздел 15, Этап 10) — необязательно:
      в компактной панели Rework (ReworkScreen.tsx) печать не нужна, это не читальный зал. */
  onPrint?: () => void;
}) {
  const [engineerComment, setEngineerComment] = useState(item.engineerComment ?? '');
  const isClosed = item.status === 'Закрыто';

  const rows: [string, string][] = [
    ['VIN', item.vin],
    ['Станция', item.station],
    ['Компонент', `${item.componentName} (${item.componentCode})`],
    ['Количество', String(item.quantity)],
    ['Тип', item.type],
    ['Создано', `${formatDate(item.createdAt)} · ${item.createdBy}`],
    ['Закрыто', item.closedAt ? `${formatDate(item.closedAt)} · ${dash(item.closedBy)}` : '—'],
  ];

  return (
    <article className="card" aria-label={`Несоответствие ${item.number}`}>
      <h2 className="mono">{item.number}</h2>
      <p className="ncp-flags">
        <span className={item.status === 'Закрыто' ? 'badge status-done' : 'badge status-progress'}>
          {item.status}
        </span>
        <span className={item.partInstalled ? 'badge status-ok' : 'badge ncp-missing'}>
          {item.partInstalled ? 'Деталь установлена' : 'Деталь не установлена'}
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

      <div className="ncp-comment">
        <span className="ncp-comment-label">Комментарий оператора</span>
        <p>{dash(item.operatorComment)}</p>
      </div>

      <label>
        Комментарий инженера
        <textarea
          rows={3}
          value={engineerComment}
          disabled={isClosed}
          onChange={(event) => setEngineerComment(event.target.value)}
        />
      </label>

      <div className="ncp-actions">
        <button type="button" onClick={() => onSetPartInstalled(!item.partInstalled)}>
          {item.partInstalled ? 'Отметить деталь не установленной' : 'Деталь установлена/заменена'}
        </button>
        <button
          type="button"
          className="primary"
          disabled={isClosed}
          onClick={() => onClose(engineerComment.trim() || null)}
        >
          {isClosed ? 'Заявка закрыта' : 'Закрыть заявку'}
        </button>
        {onPrint && (
          <button type="button" onClick={onPrint}>
            Печать NCP-листа (Red Table)
          </button>
        )}
      </div>
    </article>
  );
}
