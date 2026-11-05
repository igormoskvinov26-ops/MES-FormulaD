import { useEffect, useState } from 'react';
import { api, type NcpItem, type ProductionPlanItem } from './api';
import { NcpSheet } from './NcpSheet';
import { NcpSummarySheet } from './NcpSummarySheet';

type Props = { onClose: () => void } & ({ mode: 'individual'; item: NcpItem } | { mode: 'summary'; vin: string });

/**
 * Печать NCP-листа (раздел 15): индивидуальный — на деталь, для Red Table; сводный — по VIN,
 * после прохождения станций. Модель/производственный номер подгружаются на лету по VIN —
 * сам NcpItem их не содержит, а заводить ради одного поля постоянную связь не стал.
 */
export function NcpPrintDialog(props: Props) {
  const { onClose } = props;
  const [formedAt] = useState(() => new Date().toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' }));
  const [plan, setPlan] = useState<ProductionPlanItem | null>(null);
  const [summaryItems, setSummaryItems] = useState<NcpItem[] | null>(props.mode === 'individual' ? [] : null);
  const [error, setError] = useState('');

  const vin = props.mode === 'individual' ? props.item.vin : props.vin;

  useEffect(() => {
    api.byVin(vin).then(setPlan).catch(() => setPlan(null));
    if (props.mode === 'summary') {
      api
        .ncpList({ vin, status: null, page: 1, pageSize: 100 })
        .then((p) => setSummaryItems(p.items))
        .catch(() => setError('Не удалось загрузить несоответствия изделия'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vin, props.mode]);

  const ready = props.mode === 'individual' || summaryItems !== null;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal ncp-sheet-modal"
        role="dialog"
        aria-modal="true"
        aria-label={props.mode === 'individual' ? `NCP-лист ${props.item.number}` : `Сводный NCP-лист ${vin}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-actions no-print jobcard-modal-actions">
          <button type="button" onClick={onClose}>
            Закрыть
          </button>
          <button type="button" className="primary" disabled={!ready} onClick={() => window.print()}>
            Печать
          </button>
        </div>
        {error && (
          <p role="alert" className="error no-print">
            {error}
          </p>
        )}

        <div className="print-area">
          {props.mode === 'individual' ? (
            <NcpSheet item={props.item} plan={plan} formedAt={formedAt} />
          ) : (
            <NcpSummarySheet vin={vin} plan={plan} items={summaryItems ?? []} formedAt={formedAt} />
          )}
        </div>
      </div>
    </div>
  );
}
