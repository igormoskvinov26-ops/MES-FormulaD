import { beforeEach, describe, expect, it } from 'vitest';
import { getDensity, initDensity, setDensity } from './densityPref';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-density');
});

describe('densityPref', () => {
  it('по умолчанию комфортная; выбор запоминается и применяется при старте', () => {
    expect(getDensity()).toBe('comfortable');
    setDensity('compact');
    expect(getDensity()).toBe('compact');
    expect(localStorage.getItem('f7-density')).toBe('compact');

    document.documentElement.removeAttribute('data-density');
    initDensity();
    expect(getDensity()).toBe('compact');

    setDensity('comfortable');
    expect(document.documentElement.hasAttribute('data-density')).toBe(false);
  });
});
