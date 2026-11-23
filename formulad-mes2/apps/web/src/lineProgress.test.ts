import { describe, expect, it } from 'vitest';
import { linePosition } from './lineProgress';
import type { StationState } from './stationReadiness';

const g: StationState = 'green';
const x: StationState = 'grey';

describe('linePosition', () => {
  it('не запущенное изделие стоит до линии, собранное и с ФОК — после линии', () => {
    expect(linePosition(0, [x, x, x])).toEqual({ kind: 'before', index: 0 });
    expect(linePosition(null, [x, x, x])).toEqual({ kind: 'before', index: 0 });
    expect(linePosition(2, [g, g, g])).toEqual({ kind: 'after', index: 2 });
    expect(linePosition(3, [g, g, g])).toEqual({ kind: 'after', index: 2 });
  });
  it('в работе: следующая станция после последней полностью проверенной', () => {
    expect(linePosition(1, [x, x, x, x])).toEqual({ kind: 'on', index: 0 });
    expect(linePosition(1, [g, g, x, x])).toEqual({ kind: 'on', index: 2 });
    expect(linePosition(1, [g, x, g, x])).toEqual({ kind: 'on', index: 3 });
    expect(linePosition(4, [g, g, g])).toEqual({ kind: 'on', index: 2 });
    expect(linePosition(1, [])).toEqual({ kind: 'on', index: 0 });
  });
});
