import { useEffect, useRef, useState } from 'react';
import type { Screen } from './AppHeader';
import { AppHeader } from './AppHeader';
import { CalendarAdmin } from './CalendarAdmin';
import { EventLogAdmin } from './EventLogAdmin';
import { PrintTemplateAdmin } from './PrintTemplateAdmin';
import { SoundFileSettings, SoundToggle } from './resultSignal';
import { api, type ComponentItem, type ModelRef, type SupplierRef } from './api';
import './f7-components.css';

type AdminTab = 'models' | 'colors' | 'specs' | 'components' | 'stations' | 'suppliers' | 'calendar' | 'events' | 'print-templates' | 'sound';

const ADMIN_TABS: { key: AdminTab; label: string }[] = [
  { key: 'models', label: 'Модели' },
  { key: 'colors', label: 'Цвета' },
  { key: 'specs', label: 'Комплектации' },
  { key: 'components', label: 'Компоненты' },
  { key: 'stations', label: 'Станции' },
  { key: 'suppliers', label: 'Поставщики' },
  { key: 'calendar', label: 'Производственный календарь' },
  { key: 'events', label: 'Журнал событий' },
  { key: 'print-templates', label: 'Печатные формы' },
  { key: 'sound', label: 'Звук' },
];

export function AdminScreen({
  session,
  onNavigate,
  onLogout,
}: {
  session: { userName: string | null; mode: string };
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<AdminTab>('models');
  const [models, setModels] = useState<ModelRef[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [specs, setSpecs] = useState<string[]>([]);
  const [components, setComponents] = useState<ComponentItem[]>([]);
  const [stations, setStations] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRef[]>([]);
  const [supplierForm, setSupplierForm] = useState({ code: '', name: '', isParentPlant: false });
  const [supplierError, setSupplierError] = useState('');
  const [supplierBusy, setSupplierBusy] = useState(false);
  const [edits, setEdits] = useState<Record<string, { station: string; modelIds: string[] }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<Record<string, string>>({});
  const initedEdits = useRef(false);

  useEffect(() => {
    api.planImportReference().then((ref) => { setModels(ref.models); setColors(ref.colors); setSpecs(ref.specifications); }).catch(() => {});
    api.ncpComponents().then((cs) => {
      setComponents(cs);
      if (!initedEdits.current) {
        initedEdits.current = true;
        const init: Record<string, { station: string; modelIds: string[] }> = {};
        for (const c of cs) init[c.code] = { station: c.station ?? '', modelIds: c.modelIds ?? [] };
        setEdits(init);
      }
    }).catch(() => {});
    api.ncpStations().then(setStations).catch(() => {});
    api.suppliers().then(setSuppliers).catch(() => {});
  }, []);

  async function addSupplier() {
    const code = supplierForm.code.trim();
    const name = supplierForm.name.trim();
    if (!code || !name) { setSupplierError('Код и наименование обязательны'); return; }
    setSupplierError('');
    setSupplierBusy(true);
    try {
      await api.adminAddSupplier({ code, name, isParentPlant: supplierForm.isParentPlant });
      setSuppliers((prev) => [...prev, { code, name, isParentPlant: supplierForm.isParentPlant }]);
      setSupplierForm({ code: '', name: '', isParentPlant: false });
    } catch {
      setSupplierError('Поставщик с таким кодом уже существует или ошибка сервера');
    } finally {
      setSupplierBusy(false);
    }
  }

  async function deleteSupplier(code: string) {
    if (!window.confirm(`Удалить поставщика «${code}»?`)) return;
    try {
      await api.adminDeleteSupplier(code);
      setSuppliers((prev) => prev.filter((s) => s.code !== code));
    } catch {
      window.alert('Не удалось удалить поставщика');
    }
  }

  async function saveComponent(code: string) {
    const e = edits[code];
    if (!e) return;
    setSaving((s) => ({ ...s, [code]: true }));
    setSaveError((s) => ({ ...s, [code]: '' }));
    try {
      await api.adminUpdateComponent(code, e.station || null, e.modelIds.length > 0 ? e.modelIds : null);
      setComponents((cs) => cs.map((c) => c.code === code ? { ...c, station: e.station || null, modelIds: e.modelIds.length > 0 ? e.modelIds : null } : c));
    } catch {
      setSaveError((s) => ({ ...s, [code]: 'Ошибка сохранения' }));
    } finally {
      setSaving((s) => ({ ...s, [code]: false }));
    }
  }

  return (
    <div className="app f7plan">
      <AppHeader screen="admin" onNavigate={onNavigate} session={session} onLogout={onLogout} />
      <div className="f7plan__title">
        <span className="f7mes__slash" aria-hidden="true" />
        <div>
          <h1>АДМИНИСТРИРОВАНИЕ</h1>
          <small>Справочники: модели, цвета, комплектации, компоненты, станции, поставщики; производственный календарь; журнал событий</small>
        </div>
      </div>
      <section className="toolbar">
        <div className="controls f7plan__tabs" role="group" aria-label="Справочники">
          {ADMIN_TABS.map((t) => (
            <button key={t.key} type="button" className={tab === t.key ? 'primary' : undefined} aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        {tab !== 'calendar' && tab !== 'events' && tab !== 'print-templates' && tab !== 'sound' && (
          <div className="meta">
            <strong>Записей: {{ models: models.length, colors: colors.length, specs: specs.length, components: components.length, stations: stations.length, suppliers: suppliers.length }[tab as Exclude<AdminTab, 'calendar' | 'events' | 'print-templates' | 'sound'>]}</strong>
          </div>
        )}
      </section>
      <main className="content content-wide">
        {tab === 'calendar' && <CalendarAdmin />}
        {tab === 'events' && <EventLogAdmin />}
        {tab === 'print-templates' && <PrintTemplateAdmin />}
        {tab === 'sound' && (
          <div style={{ padding: '24px', maxWidth: 480 }}>
            <h2 style={{ marginBottom: 16 }}>Звук результата скана</h2>
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <SoundToggle />
              <span>Звук включён / выключен</span>
            </div>
            <SoundFileSettings />
          </div>
        )}
        <div className="table-wrap">
          {tab === 'models' && (
            <table>
              <thead><tr><th>Артикул</th><th>Наименование</th></tr></thead>
              <tbody>
                {models.map((m) => <tr key={m.article}><td className="mono">{m.article}</td><td>{m.name}</td></tr>)}
                {models.length === 0 && <tr><td colSpan={2} className="center muted">Нет данных</td></tr>}
              </tbody>
            </table>
          )}
          {tab === 'colors' && (
            <table>
              <thead><tr><th>Цвет</th></tr></thead>
              <tbody>
                {colors.map((c) => <tr key={c}><td>{c}</td></tr>)}
                {colors.length === 0 && <tr><td className="center muted">Нет данных</td></tr>}
              </tbody>
            </table>
          )}
          {tab === 'specs' && (
            <table>
              <thead><tr><th>Комплектация</th></tr></thead>
              <tbody>
                {specs.map((s) => <tr key={s}><td>{s}</td></tr>)}
                {specs.length === 0 && <tr><td className="center muted">Нет данных</td></tr>}
              </tbody>
            </table>
          )}
          {tab === 'components' && (
            <table>
              <thead><tr><th>Код</th><th>Наименование</th><th>Станция</th><th>Модели</th><th></th></tr></thead>
              <tbody>
                {components.map((c) => {
                  const e = edits[c.code] ?? { station: c.station ?? '', modelIds: c.modelIds ?? [] };
                  return (
                    <tr key={c.code}>
                      <td className="mono">{c.code}</td>
                      <td>{c.name}</td>
                      <td>
                        <select
                          value={e.station}
                          onChange={(ev) => setEdits((d) => ({ ...d, [c.code]: { ...e, station: ev.target.value } }))}
                          style={{ width: '5rem' }}
                        >
                          <option value="">—</option>
                          {stations.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td>
                        <select
                          multiple
                          size={Math.min(4, models.length || 1)}
                          value={e.modelIds}
                          onChange={(ev) => {
                            const selected = Array.from(ev.target.selectedOptions, (o) => o.value);
                            setEdits((d) => ({ ...d, [c.code]: { ...e, modelIds: selected } }));
                          }}
                          style={{ width: '10rem' }}
                        >
                          {models.map((m) => <option key={m.article} value={m.article}>{m.article}</option>)}
                        </select>
                      </td>
                      <td>
                        {saveError[c.code] && <span className="error" style={{ marginRight: 4, fontSize: 12 }}>{saveError[c.code]}</span>}
                        <button
                          type="button"
                          className="primary"
                          disabled={saving[c.code]}
                          onClick={() => void saveComponent(c.code)}
                          style={{ padding: '2px 10px', fontSize: 13 }}
                        >
                          {saving[c.code] ? '…' : 'Сохранить'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {components.length === 0 && <tr><td colSpan={5} className="center muted">Нет данных</td></tr>}
              </tbody>
            </table>
          )}
          {tab === 'stations' && (
            <table>
              <thead><tr><th>Станция</th></tr></thead>
              <tbody>
                {stations.map((s) => <tr key={s}><td>{s}</td></tr>)}
                {stations.length === 0 && <tr><td className="center muted">Нет данных</td></tr>}
              </tbody>
            </table>
          )}
          {tab === 'suppliers' && (
            <>
              <form className="admin-add-form" onSubmit={(e) => { e.preventDefault(); void addSupplier(); }}>
                <input
                  aria-label="Код поставщика"
                  placeholder="Код"
                  value={supplierForm.code}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, code: e.target.value }))}
                />
                <input
                  aria-label="Наименование поставщика"
                  placeholder="Наименование"
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, name: e.target.value }))}
                  style={{ minWidth: '16rem' }}
                />
                <label>
                  <input type="checkbox" checked={supplierForm.isParentPlant} onChange={(e) => setSupplierForm((f) => ({ ...f, isParentPlant: e.target.checked }))} />
                  {' '}Головной завод
                </label>
                <button type="submit" className="primary" disabled={supplierBusy}>Добавить</button>
                {supplierError && <span className="error" style={{ fontSize: 13 }}>{supplierError}</span>}
              </form>
              <table>
                <thead><tr><th>Код</th><th>Наименование</th><th>Головной завод</th><th></th></tr></thead>
                <tbody>
                  {suppliers.map((s) => (
                    <tr key={s.code}>
                      <td className="mono">{s.code}</td>
                      <td>{s.name}</td>
                      <td>{s.isParentPlant ? 'Да' : '—'}</td>
                      <td><button type="button" onClick={() => void deleteSupplier(s.code)}>Удалить</button></td>
                    </tr>
                  ))}
                  {suppliers.length === 0 && <tr><td colSpan={4} className="center muted">Нет данных</td></tr>}
                </tbody>
              </table>
            </>
          )}
        </div>
        {tab !== 'calendar' && tab !== 'events' && tab !== 'components' && <p className="muted" style={{ padding: '12px 0', fontSize: 14 }}>Редактирование справочников будет доступно в следующей версии. Сейчас данные отображаются в режиме чтения.</p>}
      </main>
    </div>
  );
}
