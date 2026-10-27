import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanScreen } from './PlanScreen';

function item(vin: string, seqn: number) {
  return {
    vin,
    id: 1000 + seqn,
    seqn,
    modelArticle: 'DEMO-800',
    modelName: 'Квадроцикл 800 · ДЕМО',
    engineNumber: `DEMO-ENGINE-${seqn}`,
    color: 'Серый',
    specificationName: 'Pathcross 1000 LTD · ДЕМО',
    status: 'planned',
    statusId: 0,
    printDate: null,
    plannedStartDate: null,
    plannedCompleteDate: null,
    plannedShipmentDate: null,
    startDate: null,
    completeDate: null,
    fokDate: null,
  };
}

const ITEMS = [item('DEMO-VIN-00001', 1), item('DEMO-VIN-00002', 2), item('DEMO-VIN-00003', 3)];

type Route = (url: string, method: string) => { status?: number; body?: unknown } | undefined;

function mockFetch(route: Route) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const result = route(url, method);
    if (!result) return new Response('{}', { status: 404 });
    const status = result.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(result.body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function baseRoutes(): Route {
  return (url) => {
    if (url.includes('/production-plan/statuses')) return { body: ['planned'] };
    if (url.includes('/production-plan?') && url.includes('pageSize=1') && !url.includes('statusId'))
      return { body: { items: [], page: 1, pageSize: 1, total: ITEMS.length } };
    if (url.includes('/production-plan?') && url.includes('pageSize=1') && url.includes('statusId'))
      return { body: { items: [], page: 1, pageSize: 1, total: 0 } };
    if (url.includes('/production-plan?') && url.includes('pageSize=25'))
      return { body: { items: ITEMS, page: 1, pageSize: 25, total: ITEMS.length } };
    return undefined;
  };
}

const session = { userName: 'demo-operator', mode: 'dev' };
const noop = () => {};

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('PlanScreen — печать JobCard', () => {
  it('отмеченные флажком изделия включают кнопку «Печать выбранных» и открывают диалог', async () => {
    mockFetch(baseRoutes());
    render(<PlanScreen session={session} onNavigate={noop} onLogout={noop} />);

    await screen.findByText('DEMO-VIN-00001');
    const printButton = screen.getByRole('button', { name: /Печать выбранных/ });
    expect(printButton).toBeDisabled();

    await userEvent.click(screen.getByLabelText('Выбрать DEMO-VIN-00001 для печати'));
    await userEvent.click(screen.getByLabelText('Выбрать DEMO-VIN-00002 для печати'));

    expect(screen.getByRole('button', { name: 'Печать выбранных (2)' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Печать выбранных (2)' }));

    expect(await screen.findByRole('dialog', { name: 'JobCard — 2 изделий' })).toBeInTheDocument();
  });

  it('двойной клик по строке сразу открывает JobCard одного изделия', async () => {
    mockFetch(baseRoutes());
    render(<PlanScreen session={session} onNavigate={noop} onLogout={noop} />);

    const row = await screen.findByLabelText('Изделие DEMO-VIN-00003');
    await userEvent.dblClick(row);

    expect(await screen.findByRole('dialog', { name: 'JobCard DEMO-VIN-00003' })).toBeInTheDocument();
  });

  it('«Выбрать первые 12» запрашивает очередь заново и заменяет выбор', async () => {
    let requestedPageSize: string | null = null;
    mockFetch((url, method) => {
      if (url.includes('pageSize=12')) {
        requestedPageSize = url;
        return { body: { items: [ITEMS[0], ITEMS[1]], page: 1, pageSize: 12, total: 2 } };
      }
      return baseRoutes()(url, method);
    });
    render(<PlanScreen session={session} onNavigate={noop} onLogout={noop} />);

    await screen.findByText('DEMO-VIN-00001');
    await userEvent.click(screen.getByRole('button', { name: 'Выбрать первые 12' }));

    await waitFor(() => expect(requestedPageSize).toContain('pageSize=12'));
    expect(await screen.findByRole('button', { name: 'Печать выбранных (2)' })).toBeInTheDocument();
  });
});
