import { describe, expect, it } from 'vitest';
import { dash, formatDate, statusBadge } from './format';

describe('format', () => {
  it('показывает пустые даты как «—», без 01.01.1970', () => {
    expect(formatDate(null)).toBe('—');
    expect(dash(null)).toBe('—');
  });

  it('не конвертирует SQL datetime в UTC', () => {
    expect(formatDate('2026-10-20T09:00:00')).toBe('20.10.2026 09:00');
    expect(formatDate('2026-11-15T00:00:00')).toBe('15.11.2026');
  });

  it('классифицирует известный статус и сохраняет оригинал неизвестного', () => {
    expect(statusBadge('in progress').label).toBe('В сборке');
    const unknown = statusBadge('custom_unknown');
    expect(unknown.label).toContain('custom_unknown');
    expect(statusBadge(null).label).toBe('Без статуса');
  });
});
