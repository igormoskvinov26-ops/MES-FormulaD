import type { ComponentCheck, ComponentItem, NcpItem } from './api';

export type StationState = 'grey' | 'blue' | 'green' | 'yellow' | 'red';

/** Раздел 11.1 спецификации: своя цветовая схема станции, отдельная от бейджей состояния изделия на плане. */
export const STATION_STATE_LABEL: Record<StationState, string> = {
  grey: 'не начата',
  blue: 'выбрана',
  green: 'выполнено',
  yellow: 'частично',
  red: 'есть несоответствие',
};

export type ReadinessInput = {
  components: ComponentItem[];
  checks: Record<string, ComponentCheck>;
  ncpItems: NcpItem[];
};

/**
 * Состояние станции по данным конкретного VIN: незакрытая NCP важнее хода проверки (красная в любом случае),
 * затем «выбрана» (только на экране «Станции»), затем доля отмеченных компонентов.
 * Станция без привязанных компонентов считается «не начата» — завершить её нечем.
 */
export function stationState(station: string, input: ReadinessInput, selected: string | null = null): StationState {
  if (input.ncpItems.some((n) => n.station === station && n.status !== 'Закрыто')) return 'red';
  if (selected === station) return 'blue';
  const list = input.components.filter((c) => c.station === station);
  if (list.length === 0) return 'grey';
  const checked = list.filter((c) => input.checks[c.code]?.checked).length;
  if (checked === 0) return 'grey';
  return checked === list.length ? 'green' : 'yellow';
}

export type ReadinessSummary = {
  states: StationState[];
  /** Станции, у которых есть что проверять (знаменатель готовности). */
  total: number;
  green: number;
  percent: number;
  openNcp: number;
};

export function readinessSummary(stations: string[], input: ReadinessInput): ReadinessSummary {
  const states = stations.map((s) => stationState(s, input));
  const countable = stations.filter((s) => input.components.some((c) => c.station === s));
  const green = countable.filter((s) => stationState(s, input) === 'green').length;
  const total = countable.length;
  return {
    states,
    total,
    green,
    percent: total === 0 ? 0 : Math.round((green / total) * 100),
    openNcp: input.ncpItems.filter((n) => n.status !== 'Закрыто').length,
  };
}
