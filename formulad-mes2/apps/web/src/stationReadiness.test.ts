import { describe, expect, it } from 'vitest';
import type { ComponentCheck, ComponentItem, NcpItem } from './api';
import { readinessSummary, stationState } from './stationReadiness';

const components: ComponentItem[] = [
  { code: 'A', name: 'A', station: '1' },
  { code: 'B', name: 'B', station: '1' },
  { code: 'C', name: 'C', station: '2' },
];
const check = (code: string): ComponentCheck => ({ componentCode: code, checked: true, checkedBy: 'u', checkedAt: '2026-01-01T00:00:00' });
const ncp = (station: string, status: string) => ({ station, status }) as NcpItem;

describe('stationState', () => {
  it('серая, пока ничего не отмечено, и для станции без компонентов', () => {
    expect(stationState('1', { components, checks: {}, ncpItems: [] })).toBe('grey');
    expect(stationState('9', { components, checks: {}, ncpItems: [] })).toBe('grey');
  });

  it('жёлтая при частичной отметке, зелёная когда отмечено всё', () => {
    expect(stationState('1', { components, checks: { A: check('A') }, ncpItems: [] })).toBe('yellow');
    expect(stationState('1', { components, checks: { A: check('A'), B: check('B') }, ncpItems: [] })).toBe('green');
  });

  it('открытая NCP делает станцию красной даже при полной проверке; закрытая — нет', () => {
    const checks = { A: check('A'), B: check('B') };
    expect(stationState('1', { components, checks, ncpItems: [ncp('1', 'Открыто')] })).toBe('red');
    expect(stationState('1', { components, checks, ncpItems: [ncp('1', 'Закрыто')] })).toBe('green');
  });

  it('«выбрана» уступает красной и перекрывает остальные', () => {
    expect(stationState('2', { components, checks: {}, ncpItems: [] }, '2')).toBe('blue');
    expect(stationState('2', { components, checks: {}, ncpItems: [ncp('2', 'Открыто')] }, '2')).toBe('red');
  });
});

describe('readinessSummary', () => {
  it('процент считается только по станциям, у которых есть компоненты', () => {
    const s = readinessSummary(['1', '2', '3'], { components, checks: { C: check('C') }, ncpItems: [] });
    expect(s).toMatchObject({ total: 2, green: 1, percent: 50, openNcp: 0 });
    expect(s.states).toEqual(['grey', 'green', 'grey']);
  });

  it('без станций и компонентов готовность 0, а не NaN', () => {
    expect(readinessSummary([], { components: [], checks: {}, ncpItems: [] }).percent).toBe(0);
  });

  it('считает открытые NCP', () => {
    const s = readinessSummary(['1'], { components, checks: {}, ncpItems: [ncp('1', 'Открыто'), ncp('1', 'Закрыто')] });
    expect(s.openNcp).toBe(1);
  });
});
