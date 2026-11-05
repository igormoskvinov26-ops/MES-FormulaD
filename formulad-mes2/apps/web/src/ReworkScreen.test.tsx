import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReworkScreen } from './ReworkScreen';

const ITEM = {
  vin: 'DEMO-VIN-00001',
  id: 1001,
  seqn: 23,
  modelArticle: 'DEMO-800',
  modelName: 'Квадроцикл 800 · ДЕМО',
  engineNumber: 'DEMO-ENGINE-01',
  color: 'Серый',
  specificationName: null,
  status: 'rework',
  statusId: 4,
  printDate: null,
  plannedStartDate: null,
  plannedCompleteDate: null,
  plannedShipmentDate: null,
  startDate: null,
  completeDate: null,
  fokDate: null,
};

const NCP_OPEN = {
  id: 1,
  number: 'NC-2026-0001',
  vin: 'DEMO-VIN-00001',
  station: '3',
  componentCode: 'DEMO-CMP-014',
  componentName: 'Рычаг подвески передний · ДЕМО',
  quantity: 1,
  type: 'Брак',
  operatorComment: null,
  engineerComment: null,
  status: 'Открыто',
  partInstalled: false,
  createdAt: '2026-10-20T11:15:00',
  createdBy: 'demo-operator',
  closedAt: null,
  closedBy: null,
};

type Route = (url: string, method: string, body?: unknown) => { status?: number; body?: unknown } | undefined;

function mockFetch(route: Route) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    const result = route(url, method, body);
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

const session = { userName: 'demo-operator', mode: 'dev' };
const noop = () => {};

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('ReworkScreen', () => {
  it('открытая NCP видна сразу и блокирует «Завершить Rework», как у FOK', async () => {
    mockFetch((url) => {
      if (url.includes('statusId=4')) return { body: { items: [ITEM], page: 1, pageSize: 25, total: 1 } };
      if (url.endsWith('/production-plan/DEMO-VIN-00001')) return { body: ITEM };
      if (url.includes('/ncp/missing-parts')) return { body: [NCP_OPEN] };
      if (url.includes('/api/v1/ncp?')) return { body: { items: [NCP_OPEN], page: 1, pageSize: 100, total: 1 } };
      return undefined;
    });

    render(<ReworkScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('Сканирование VIN'), 'DEMO-VIN-00001{Enter}');

    expect(await screen.findByRole('status')).toHaveTextContent('NC-2026-0001');
    expect(screen.getByRole('button', { name: 'Завершить Rework' })).toBeDisabled();
  });

  it('показывает список NCP изделия и счётчик «всего/устранено» прямо в карточке', async () => {
    mockFetch((url) => {
      if (url.includes('statusId=4')) return { body: { items: [ITEM], page: 1, pageSize: 25, total: 1 } };
      if (url.endsWith('/production-plan/DEMO-VIN-00001')) return { body: ITEM };
      if (url.includes('/ncp/missing-parts')) return { body: [NCP_OPEN] };
      if (url.includes('/api/v1/ncp?')) return { body: { items: [NCP_OPEN], page: 1, pageSize: 100, total: 1 } };
      return undefined;
    });

    render(<ReworkScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('Сканирование VIN'), 'DEMO-VIN-00001{Enter}');

    expect(await screen.findByLabelText('Несоответствие NC-2026-0001')).toBeInTheDocument();
    expect(screen.getByText(/Всего NCP:/)).toBeInTheDocument();
  });

  it('отметка установки детали прямо в окне Rework снимает блокировку без повторного скана', async () => {
    let installed = false;
    mockFetch((url, method, body) => {
      if (url.includes('statusId=4')) return { body: { items: [ITEM], page: 1, pageSize: 25, total: 1 } };
      if (url.endsWith('/production-plan/DEMO-VIN-00001')) return { body: ITEM };
      if (url.includes('/ncp/missing-parts')) return { body: installed ? [] : [NCP_OPEN] };
      if (url.includes('/api/v1/ncp?')) {
        return { body: { items: [{ ...NCP_OPEN, partInstalled: installed }], page: 1, pageSize: 100, total: 1 } };
      }
      if (url.endsWith('/ncp/1/part-installed') && method === 'POST') {
        installed = true;
        expect(body).toEqual({ installed: true });
        return { body: { ...NCP_OPEN, partInstalled: true } };
      }
      return undefined;
    });

    render(<ReworkScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('Сканирование VIN'), 'DEMO-VIN-00001{Enter}');
    const card = await screen.findByLabelText('Несоответствие NC-2026-0001');

    await userEvent.click(within(card).getByRole('button', { name: /Деталь установлена\/заменена/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Завершить Rework' })).toBeEnabled());
  });

  it('«Завершить Rework» переводит изделие в статус 2', async () => {
    mockFetch((url, method) => {
      if (url.includes('statusId=4')) return { body: { items: [], page: 1, pageSize: 25, total: 0 } };
      if (url.endsWith('/production-plan/DEMO-VIN-00001')) return { body: ITEM };
      if (url.includes('/ncp/missing-parts')) return { body: [] };
      if (url.includes('/api/v1/ncp?')) return { body: { items: [], page: 1, pageSize: 100, total: 0 } };
      if (url.endsWith('/rework/finish') && method === 'POST') return { body: { ...ITEM, statusId: 2, status: 'complete' } };
      return undefined;
    });

    render(<ReworkScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('Сканирование VIN'), 'DEMO-VIN-00001{Enter}');
    await screen.findByRole('button', { name: 'Завершить Rework' });

    await userEvent.click(screen.getByRole('button', { name: 'Завершить Rework' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Производство завершено');
  });
});
