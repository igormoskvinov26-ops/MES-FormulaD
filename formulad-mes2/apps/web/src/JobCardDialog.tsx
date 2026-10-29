import { useState } from 'react';
import { api, type ProductionPlanItem } from './api';
import { JobCard } from './JobCard';

/**
 * Печать одной или нескольких JobCard (раздел 8: карточка по VIN и пакетная печать выбранных).
 * «Печать» отмечает PrintDate на сервере для каждого изделия, затем открывает системный
 * диалог печати — раздел 149, [П]: повторная печать не создаёт новое изделие, только отметку.
 */
export function JobCardDialog({ items, onClose }: { items: ProductionPlanItem[]; onClose: () => void }) {
  const [formedAt] = useState(() => new Date().toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' }));
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState(false);

  async function handlePrint() {
    setError('');
    setPrinting(true);
    try {
      await Promise.all(items.map((item) => api.print(item.vin)));
    } catch {
      setError('Не удалось отметить дату печати — карточка всё равно напечатается.');
    } finally {
      setPrinting(false);
      window.print();
    }
  }

  // no-print НЕ ставим на сам backdrop: это предок .print-area, а display:none
  // убирает весь поддерево безусловно — никакой visibility:visible внутри его не спасёт.
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal jobcard-modal"
        role="dialog"
        aria-modal="true"
        aria-label={items.length === 1 ? `JobCard ${items[0].vin}` : `JobCard — ${items.length} изделий`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-actions no-print jobcard-modal-actions">
          <button type="button" onClick={onClose}>
            Закрыть
          </button>
          <button type="button" className="primary" disabled={printing} onClick={() => void handlePrint()}>
            {printing ? 'Печать…' : `Печать${items.length > 1 ? ` (${items.length})` : ''}`}
          </button>
        </div>
        {error && (
          <p role="alert" className="error no-print">
            {error}
          </p>
        )}

        <div className="print-area">
          {items.map((item) => (
            <JobCard key={item.vin} item={item} formedAt={formedAt} />
          ))}
        </div>
      </div>
    </div>
  );
}
