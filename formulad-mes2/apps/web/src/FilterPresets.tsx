import { useState } from 'react';

export type FilterState = { vin: string; statusChoice: string; filterStatusId: number | null };

const STORAGE_KEY = 'f7-filter-presets';
const BUILTIN: { name: string; state: FilterState }[] = [
  { name: 'Все', state: { vin: '', statusChoice: '__all__', filterStatusId: null } },
  { name: 'В работе', state: { vin: '', statusChoice: '__all__', filterStatusId: 1 } },
  { name: 'Плановые', state: { vin: '', statusChoice: '__all__', filterStatusId: 0 } },
];

function loadCustom(): { name: string; state: FilterState }[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}
function saveCustom(presets: { name: string; state: FilterState }[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(presets)); } catch { /* */ }
}

export function FilterPresets({
  current,
  onApply,
}: {
  current: FilterState;
  onApply: (state: FilterState) => void;
}) {
  const [custom, setCustom] = useState(loadCustom);
  const all = [...BUILTIN, ...custom];

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (v === '__save__') {
      const name = prompt('Имя пресета:');
      if (!name?.trim()) return;
      const next = [...custom, { name: name.trim(), state: { ...current } }];
      setCustom(next);
      saveCustom(next);
      return;
    }
    if (v === '__delete__') {
      const name = prompt('Удалить пресет (имя):');
      if (!name) return;
      const next = custom.filter((p) => p.name !== name.trim());
      setCustom(next);
      saveCustom(next);
      return;
    }
    const preset = all[Number(v)];
    if (preset) onApply(preset.state);
  }

  return (
    <select aria-label="Пресет фильтров" onChange={handleChange} value="">
      <option value="" disabled>Пресеты…</option>
      {all.map((p, i) => (
        <option key={p.name} value={i}>{p.name}</option>
      ))}
      <option value="__save__">💾 Сохранить текущие…</option>
      {custom.length > 0 && <option value="__delete__">🗑 Удалить пресет…</option>}
    </select>
  );
}
