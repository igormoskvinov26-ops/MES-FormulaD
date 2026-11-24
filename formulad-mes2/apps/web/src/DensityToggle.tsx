import { useEffect, useState } from 'react';
import { getDensity, setDensity, subscribeDensity } from './densityPref';

export function DensityToggle() {
  const [density, setLocal] = useState(getDensity);
  useEffect(() => subscribeDensity(() => setLocal(getDensity())), []);
  const compact = density === 'compact';
  return (
    <span className="density-toggle" role="radiogroup" aria-label="Плотность таблицы">
      <button
        type="button"
        role="radio"
        aria-checked={compact}
        aria-label="Компактно"
        title="Компактная таблица"
        className={compact ? 'active' : undefined}
        onClick={() => setDensity('compact')}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <line x1="1" y1="3" x2="13" y2="3" /><line x1="1" y1="7" x2="13" y2="7" /><line x1="1" y1="11" x2="13" y2="11" />
        </svg>
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={!compact}
        aria-label="Комфортно"
        title="Комфортная таблица"
        className={compact ? undefined : 'active'}
        onClick={() => setDensity('comfortable')}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <line x1="1" y1="2" x2="13" y2="2" /><line x1="1" y1="7" x2="13" y2="7" /><line x1="1" y1="12" x2="13" y2="12" />
        </svg>
      </button>
    </span>
  );
}
