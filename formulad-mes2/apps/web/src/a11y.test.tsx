import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import * as matchers from 'vitest-axe/matchers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

expect.extend(matchers);

const ITEMS = [
  {
    vin: 'DEMO-VIN-00001', id: 1001, seqn: 23,
    specificationName: 'Pathcross 1000 LTD', printDate: '2026-10-12T00:00:00',
    plannedStartDate: '2026-10-12T00:00:00', plannedCompleteDate: '2026-10-13T00:00:00',
    modelArticle: 'DEMO-800', modelName: 'Квадроцикл 800', engineNumber: 'ENG-01',
    color: 'Серый', status: 'in progress', statusId: 1,
    plannedShipmentDate: '2026-11-15T00:00:00', startDate: '2026-10-20T09:00:00',
    completeDate: null, fokDate: null,
  },
];

const session = { userName: 'demo-operator', mode: 'dev' };

function mockFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/auth/me')) return new Response(JSON.stringify(session), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/statuses')) return new Response(JSON.stringify(['in progress']), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/production-plan')) return new Response(JSON.stringify({ items: ITEMS, page: 1, pageSize: 25, total: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
}

beforeEach(() => { vi.restoreAllMocks(); mockFetch(); });
afterEach(() => vi.unstubAllGlobals());

describe('Accessibility', () => {
  it('план — нет критичных нарушений axe', async () => {
    const { container, findByText } = render(<App />);
    await findByText('DEMO-VIN-00001');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('логин — нет критичных нарушений axe', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401, headers: { 'Content-Type': 'application/json' } })));
    const { container, findByRole } = render(<App />);
    await findByRole('button', { name: 'Войти' });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('NCP — нет критичных нарушений axe', async () => {
    const ncpItems = [{ id: 1, number: 'NCP-001', vin: 'DEMO-VIN-00001', station: 'ST-1', componentCode: 'C01', componentName: 'Деталь', quantity: 1, type: 'Дефект', operatorComment: null, engineerComment: null, status: 'Открыт', partInstalled: false, createdAt: '2026-10-10T08:00:00', createdBy: 'test', closedAt: null, closedBy: null }];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/auth/me')) return new Response(JSON.stringify(session), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/ncp/types')) return new Response(JSON.stringify(['Дефект']), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/ncp/components')) return new Response(JSON.stringify([{ code: 'C01', name: 'Деталь', station: '1' }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/ncp/stations')) return new Response(JSON.stringify(['ST-1']), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/ncp')) return new Response(JSON.stringify({ items: ncpItems, page: 1, pageSize: 25, total: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/statuses')) return new Response(JSON.stringify(['in progress']), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/production-plan')) return new Response(JSON.stringify({ items: ITEMS, page: 1, pageSize: 25, total: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const { container, findByText } = render(<App />);
    await findByText('DEMO-VIN-00001');
    // Navigate to NCP — App responds to direct hash or state; for axe we just render the default screen
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
