import { useEffect, useState } from 'react';
import { getDensity, setDensity, subscribeDensity } from './densityPref';

export function DensityToggle() {
  const [density, setLocal] = useState(getDensity);
  useEffect(() => subscribeDensity(() => setLocal(getDensity())), []);
  const compact = density === 'compact';
  return (
    <button
      type="button"
      aria-pressed={compact}
      title="Плотность таблицы: компактная вмещает больше строк"
      onClick={() => setDensity(compact ? 'comfortable' : 'compact')}
    >
      {compact ? 'Компактно' : 'Комфортно'}
    </button>
  );
}
