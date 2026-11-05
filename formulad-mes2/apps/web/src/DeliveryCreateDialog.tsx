import { useEffect, useState } from 'react';
import type { SupplierRef } from './api';

/** Создание поставки (раздел 19): поставщик из справочника, инвойс и дата, необязательный
    сопроводительный документ. Дальше заполняется Packing List — отдельный шаг на экране поставки. */
export function DeliveryCreateDialog({
  suppliers,
  onCreate,
  onClose,
}: {
  suppliers: SupplierRef[];
  onCreate: (data: { supplierCode: string; invoiceNumber: string; invoiceDate: string; accompanyingDocument: string | null }) => void;
  onClose: () => void;
}) {
  const [supplierCode, setSupplierCode] = useState(suppliers[0]?.code ?? '');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [accompanyingDocument, setAccompanyingDocument] = useState('');

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const valid = supplierCode && invoiceNumber.trim().length > 0 && invoiceDate.trim().length > 0;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Новая поставка"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          onCreate({
            supplierCode,
            invoiceNumber: invoiceNumber.trim(),
            invoiceDate,
            accompanyingDocument: accompanyingDocument.trim() || null,
          });
        }}
      >
        <h2>Новая поставка</h2>

        <label>
          Поставщик
          <select value={supplierCode} onChange={(event) => setSupplierCode(event.target.value)}>
            {suppliers.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
                {s.isParentPlant ? ' · материнский завод' : ''}
              </option>
            ))}
          </select>
        </label>

        <label>
          Номер инвойса
          <input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} required />
        </label>

        <label>
          Дата инвойса
          <input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} required />
        </label>

        <label>
          Сопроводительный документ (необязательно)
          <input value={accompanyingDocument} onChange={(event) => setAccompanyingDocument(event.target.value)} />
        </label>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Отмена (Esc)
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            Создать
          </button>
        </div>
      </form>
    </div>
  );
}
