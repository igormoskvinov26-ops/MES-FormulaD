import { STATION_STATE_LABEL, type StationState } from './stationReadiness';

export type TwinMode = 'idle' | 'ready' | 'blocked' | 'done';

const CX = 180;
const CY = 180;
const R = 150;
const LABEL_R = 172;
const GAP_DEG = 5;

function polar(radius: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

function arc(startDeg: number, endDeg: number) {
  const a = polar(R, startDeg);
  const b = polar(R, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

export function ReadinessTwin({
  stations,
  states,
  percent,
  green,
  total,
  mode,
  selected = null,
  onSelect,
  image = null,
}: {
  stations: string[];
  states: StationState[];
  percent: number;
  green: number;
  total: number;
  mode: TwinMode;
  selected?: string | null;
  onSelect?: (station: string | null) => void;
  image?: string | null;
}) {
  const n = stations.length;
  const span = n > 0 ? 360 / n : 360;
  const summary = total > 0 ? `Готовность станций: ${green} из ${total}` : 'Нет данных о станциях';

  return (
    <figure className="twin" data-mode={mode} aria-label={summary}>
      <svg className="twin__ring" viewBox="0 0 360 360" role={onSelect ? 'group' : 'img'} aria-label={summary}>
        {n === 0 && <circle className="twin__seg twin__seg--grey" cx={CX} cy={CY} r={R} fill="none" />}
        {stations.map((station, i) => {
          const start = i * span + GAP_DEG / 2;
          const end = (i + 1) * span - GAP_DEG / 2;
          const mid = polar(LABEL_R, (start + end) / 2);
          const state = states[i] ?? 'grey';
          const label = `Станция ${station} — ${STATION_STATE_LABEL[state]}`;
          const isSelected = selected === station;
          const toggle = () => onSelect?.(isSelected ? null : station);
          const interactive = onSelect
            ? {
                role: 'button' as const,
                tabIndex: 0,
                'aria-pressed': isSelected,
                'aria-label': label,
                onClick: toggle,
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle();
                  }
                },
              }
            : {};
          return (
            <g key={station} className={`twin__stn${onSelect ? ' twin__stn--interactive' : ''}${isSelected ? ' twin__stn--selected' : ''}`} {...interactive}>
              {onSelect && <path className="twin__hit" d={arc(start, end)} fill="none" />}
              <path className={`twin__seg twin__seg--${state}`} d={arc(start, end)} fill="none">
                <title>{label}</title>
              </path>
              <text className="twin__label" x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central">
                {station}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="twin__car" aria-hidden="true" data-variant={image ? 'model' : undefined}>
        <img src={image ?? '/atv-hero.png'} alt="" draggable={false} />
        <span className="twin__lamp twin__lamp--l" />
        <span className="twin__lamp twin__lamp--r" />
      </div>

      <figcaption className="twin__caption">
        <b>{mode === 'done' ? 'FINAL OK' : `${percent}%`}</b>
        <span>{mode === 'done' ? 'изделие подтверждено' : summary}</span>
      </figcaption>
    </figure>
  );
}
