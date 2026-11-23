import type { StationState } from './stationReadiness';

export type LinePosition = { kind: 'before' | 'on' | 'after'; index: number };

export function linePosition(statusId: number | null, states: StationState[]): LinePosition {
  const n = states.length;
  if (statusId === 3 || statusId === 2) return { kind: 'after', index: n - 1 };
  if (statusId === 0 || statusId === null) return { kind: 'before', index: 0 };
  const lastDone = states.reduce((acc, s, i) => (s === 'green' ? i : acc), -1);
  return { kind: 'on', index: Math.max(0, Math.min(n - 1, lastDone + 1)) };
}
