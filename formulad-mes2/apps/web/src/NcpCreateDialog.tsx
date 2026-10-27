import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentItem } from './api';

/** Регистрация несоответствия. Поля — раздел 14 спецификации: VIN, станция, компонент,
    количество, тип (брак/пересорт/недостача/прочее), комментарий оператора. */
export function NcpCreateDialog({
  types,
  stations,
  components,
  defaultVin,
  onCreate,
  onClose,
}: {
  types: string[];
  stations: string[];
  components: ComponentItem[];
  defaultVin: string;
  onCreate: (data: {
    vin: string;
    station: string;
    componentCode: string;
    quantity: number;
    type: string;
    operatorComment: string | null;
  }) => void;
  onClose: () => void;
}) {
  const [vin, setVin] = useState(defaultVin);
  const [station, setStation] = useState(stations[0] ?? '');
  const [componentCode, setComponentCode] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [type, setType] = useState(types[0] ?? '');
  const [comment, setComment] = useState('');
  const vinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (defaultVin) return; // VIN уже известен (создали из карточки изделия) — фокус на станцию не нужен
    vinRef.current?.focus();
  }, [defaultVin]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Компоненты сужаются до выбранной станции; если для неё ничего нет — показываем весь список,
  // чтобы форма не оказалась пустой из-за демо-данных.
  const forStation = useMemo(() => components.filter((c) => c.station === station), [components, station]);
  const options = forStation.length > 0 ? forStation : components;

  useEffect(() => {
    if (!options.some((c) => c.code === componentCode)) {
      setComponentCode(options[0]?.code ?? '');
    }
  }, [options, componentCode]);

  const qty = Number(quantity);
  const valid = vin.trim().length > 0 && station && componentCode && Number.isInteger(qty) && qty >= 1 && type;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Регистрация несоответствия"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          onCreate({
            vin: vin.trim(),
            station,
            componentCode,
            quantity: qty,
            type,
            operatorComment: comment.trim() || null,
          });
        }}
      >
        <h2>Зарегистрировать несоответствие</h2>

        <label>
          VIN
          <input
            ref={vinRef}
            value={vin}
            maxLength={50}
            readOnly={Boolean(defaultVin)}
            onChange={(event) => setVin(event.target.value)}
            required
          />
        </label>

        <label>
          Станция
          <select value={station} onChange={(event) => setStation(event.target.value)}>
            {stations.map((s) => (
              <option key={s} value={s}>
                Станция {s}
              </option>
            ))}
          </select>
        </label>

        <label>
          Компонент
          <select value={componentCode} onChange={(event) => setComponentCode(event.target.value)}>
            {options.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </label>

        <label>
          Количество
          <input
            type="number"
            min={1}
            max={9999}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>

        <label>
          Тип
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label>
          Комментарий оператора
          <textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} />
        </label>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Отмена (Esc)
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            Зарегистрировать
          </button>
        </div>
      </form>
    </div>
  );
}
