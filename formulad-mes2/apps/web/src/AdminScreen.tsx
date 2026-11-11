import { useEffect, useState } from 'react';
import type { Screen } from './AppHeader';
import { AppHeader } from './AppHeader';
import { api, type ComponentItem, type ModelRef, type SupplierRef } from './api';
import './f7-components.css';

type AdminTab = 'models' | 'colors' | 'specs' | 'components' | 'stations' | 'suppliers';

const ADMIN_TABS: { key: AdminTab; label: string }[] = [
  { key: 'models', label: 'Модели' },
  { key: 'colors', label: 'Цвета' },
  { key: 'specs', label: 'Комплектации' },
  { key: 'components', label: 'Компоненты' },
  { key: 'stations', label: 'Станции' },
  { key: 'suppliers', label: 'Поставщики' },
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

  useEffect(() => {
    api.planImportReference().then((ref) => { setModels(ref.models); setColors(ref.colors); setSpecs(ref.specifications); }).catch(() => {});
    api.ncpComponents().then(setComponents).catch(() => {});
    api.ncpStations().then(setStations).catch(() => {});
    api.suppliers().then(setSuppliers).catch(() => {});
  }, []);

  return (
    <div className="app f7plan">
      <AppHeader screen="admin" onNavigate={onNavigate} session={session} onLogout={onLogout} />
      <div className="f7plan__title">
        <span className="f7mes__slash" aria-hidden="true" />
        <div>
          <h1>АДМИНИСТРИРОВАНИЕ</h1>
          <small>Справочники: модели, цвета, комплектации, компоненты, станции, поставщики</small>
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
        <div className="meta">
          <strong>Записей: {{ models: models.length, colors: colors.length, specs: specs.length, components: components.length, stations: stations.length, suppliers: suppliers.length }[tab]}</strong>
        </div>
      </section>
      <main className="content content-wide">
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
              <thead><tr><th>Код</th><th>Наименование</th><th>Станция</th></tr></thead>
              <tbody>
                {components.map((c) => <tr key={c.code}><td className="mono">{c.code}</td><td>{c.name}</td><td>{c.station ?? '—'}</td></tr>)}
                {components.length === 0 && <tr><td colSpan={3} className="center muted">Нет данных</td></tr>}
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
            <table>
              <thead><tr><th>Код</th><th>Наименование</th><th>Головной завод</th></tr></thead>
              <tbody>
                {suppliers.map((s) => <tr key={s.code}><td className="mono">{s.code}</td><td>{s.name}</td><td>{s.isParentPlant ? 'Да' : '—'}</td></tr>)}
                {suppliers.length === 0 && <tr><td colSpan={3} className="center muted">Нет данных</td></tr>}
              </tbody>
            </table>
          )}
        </div>
        <p className="muted" style={{ padding: '12px 0', fontSize: 14 }}>Редактирование справочников будет доступно в следующей версии. Сейчас данные отображаются в режиме чтения.</p>
      </main>
    </div>
  );
}
