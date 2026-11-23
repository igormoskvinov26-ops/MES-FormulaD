import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventLogEntry } from './api';
import { EventLogAdmin, formatStamp } from './EventLogAdmin';

const ROWS: EventLogEntry[] = [
  { id: 3, entityType: 'Calendar', entityKey: '2026-11-09', action: 'Set', oldValue: null, newValue: 'выходной', userName: 'demo-operator', occurredAt: '2026-11-06T07:37:12.123' },
  { id: 2, entityType: 'ProductionPlan', entityKey: 'DEMO-VIN-00003', action: 'Move', oldValue: '25', newValue: '24', userName: 'demo-operator', occurredAt: '2026-11-06T07:30:00' },
  { id: 1, entityType: 'Mystery', entityKey: 'K', action: 'Strange', oldValue: null, newValue: null, userName: 'x', occurredAt: '2026-11-05T10:00:00' },
];
let urls: string[];

beforeEach(() => {
  urls = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    const q = new URL(url, 'http://x').searchParams;
    const rows = ROWS.filter((r) => (!q.get('entityType') || r.entityType === q.get('entityType')) && (!q.get('entityKey') || r.entityKey === q.get('entityKey')));
    return new Response(JSON.stringify(rows.slice(0, +(q.get('limit') ?? 100))), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('EventLogAdmin', () => {
  it('формат времени ДД.ММ.ГГГГ ЧЧ:ММ:СС', () => expect(formatStamp('2026-11-06T07:37:12.123')).toBe('06.11.2026 07:37:12'));

  it('показывает записи с понятными названиями, неизвестные значения — как есть', async () => {
    render(<EventLogAdmin />);
    const table = await screen.findByRole('table');
    expect(await within(table).findByText('06.11.2026 07:37:12')).toBeInTheDocument();
    expect(within(table).getByText('Календарь')).toBeInTheDocument();
    expect(within(table).getByText('Установка')).toBeInTheDocument();
    expect(within(table).getByText('Перестановка')).toBeInTheDocument();
    expect(within(table).getByText('Mystery')).toBeInTheDocument();
    expect(within(table).getByText('Strange')).toBeInTheDocument();
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('2026-11-09');
  });

  it('фильтры по объекту и ключу и лимит уходят в запрос; «Обновить» перезагружает', async () => {
    render(<EventLogAdmin />);
    await screen.findByText('06.11.2026 07:37:12');
    fireEvent.change(screen.getByLabelText('Объект'), { target: { value: 'ProductionPlan' } });
    expect(await screen.findByText('DEMO-VIN-00003')).toBeInTheDocument();
    expect(screen.queryByText('2026-11-09')).not.toBeInTheDocument();
    expect(urls.at(-1)).toContain('entityType=ProductionPlan');

    fireEvent.change(screen.getByLabelText('Ключ (VIN, номер…)'), { target: { value: 'НЕТ' } });
    expect(await screen.findByText('Записей нет')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Показать'), { target: { value: '500' } });
    await screen.findByText('Записей нет');
    expect(urls.at(-1)).toContain('limit=500');

    const before = urls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }));
    await screen.findByText('Записей нет');
    expect(urls.length).toBeGreaterThan(before);
  });
});
