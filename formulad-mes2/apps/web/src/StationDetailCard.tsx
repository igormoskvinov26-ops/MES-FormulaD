import type { ComponentCheck, ComponentItem, NcpItem } from './api';
import { formatDate } from './format';
import { STATION_STATE_LABEL, type StationState } from './stationReadiness';

/**
 * Сведения об одной станции для выбранного изделия: компоненты с отметкой «проверено» (кто и когда)
 * и открытые несоответствия. Открывается нажатием на сегмент кольца готовности на экране FOK.
 */
export function StationDetailCard({
  station,
  state,
  components,
  checks,
  ncpItems,
  onClose,
  onOpenNcp,
}: {
  station: string;
  state: StationState;
  components: ComponentItem[];
  checks: Record<string, ComponentCheck>;
  ncpItems: NcpItem[];
  onClose: () => void;
  onOpenNcp: () => void;
}) {
  const list = components.filter((c) => c.station === station);
  const done = list.filter((c) => checks[c.code]?.checked).length;
  const open = ncpItems.filter((n) => n.station === station && n.status !== 'Закрыто');

  return (
    <section className="stn-detail" aria-label={`Станция ${station}`} data-state={state}>
      <header className="stn-detail__head">
        <h3>Станция {station}</h3>
        <span className="stn-detail__badge">{STATION_STATE_LABEL[state]}</span>
        <button type="button" className="stn-detail__close" aria-label="Закрыть сведения о станции" onClick={onClose}>
          ×
        </button>
      </header>

      {list.length === 0 ? (
        <p className="stn-detail__empty">К станции не привязано компонентов — проверять нечего.</p>
      ) : (
        <>
          <p className="stn-detail__count">
            Отмечено <b>{done}</b> из <b>{list.length}</b>
          </p>
          <ul className="stn-detail__list">
            {list.map((c) => {
              const check = checks[c.code];
              const checked = Boolean(check?.checked);
              return (
                <li key={c.code} data-checked={String(checked)}>
                  <span className="stn-detail__mark" aria-hidden="true">{checked ? '✓' : '○'}</span>
                  <span className="stn-detail__name">
                    <strong>{c.name}</strong>
                    <small>{checked ? `${check?.checkedBy ?? '—'}, ${formatDate(check?.checkedAt ?? null)}` : 'не отмечено'}</small>
                  </span>
                  <span className="sr-only">{checked ? 'проверено' : 'не проверено'}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {open.length > 0 && (
        <div className="stn-detail__ncp">
          <div className="stn-detail__ncp-title">Открытые несоответствия · {open.length}</div>
          <ul>
            {open.map((n) => (
              <li key={n.id}>
                <strong>{n.number}</strong>
                <small>{n.componentName} · {n.type}</small>
              </li>
            ))}
          </ul>
          <button type="button" className="stn-detail__action" onClick={onOpenNcp}>
            К несоответствиям
          </button>
        </div>
      )}
    </section>
  );
}
