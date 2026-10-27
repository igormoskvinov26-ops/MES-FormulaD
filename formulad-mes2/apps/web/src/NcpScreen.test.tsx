import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NcpScreen } from './NcpScreen';

const NCP_ITEMS = [
  {
    id: 1,
    number: 'NC-2026-0001',
    vin: 'DEMO-VIN-00001',
    station: '3',
    componentCode: 'DEMO-CMP-014',
    componentName: 'Рычаг подвески передний · ДЕМО',
    quantity: 1,
    type: 'Брак',
    operatorComment: 'Задир на посадочной поверхности',
    engineerComment: null,
    status: 'Открыто',
    partInstalled: false,
    createdAt: '2026-10-20T11:15:00',
    createdBy: 'demo-operator',
    closedAt: null,
    closedBy: null,
  },
];

const TYPES = ['Брак', 'Пересорт', 'Недостача', 'Прочее'];
const STATIONS = ['1', '2', '3'];
const COMPONENTS = [{ code: 'DEMO-CMP-014', name: 'Рычаг подвески передний · ДЕМО', station: '3' }];

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

describe('NcpScreen', () => {
  it('показывает список несоответствий со статусом и признаком установки детали', async () => {
    mockFetch((url) => {
      if (url.includes('/ncp/types')) return { body: TYPES };
      if (url.includes('/ncp/stations')) return { body: STATIONS };
      if (url.includes('/ncp/components')) return { body: COMPONENTS };
      if (url.includes('/api/v1/ncp?')) return { body: { items: NCP_ITEMS, page: 1, pageSize: 25, total: 1 } };
      return undefined;
    });

    render(<NcpScreen session={session} onNavigate={noop} onLogout={noop} />);

    expect(await screen.findByText('NC-2026-0001')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Открыто')).toBeInTheDocument();
    expect(within(table).getByText('не установлена')).toBeInTheDocument();
  });

  it('по клику на строку открывает карточку с раздельными действиями', async () => {
    mockFetch((url) => {
      if (url.includes('/ncp/types')) return { body: TYPES };
      if (url.includes('/ncp/stations')) return { body: STATIONS };
      if (url.includes('/ncp/components')) return { body: COMPONENTS };
      if (url.includes('/api/v1/ncp?')) return { body: { items: NCP_ITEMS, page: 1, pageSize: 25, total: 1 } };
      return undefined;
    });

    render(<NcpScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.click(await screen.findByText('NC-2026-0001'));

    const card = await screen.findByLabelText('Несоответствие NC-2026-0001');
    expect(within(card).getByText('Задир на посадочной поверхности')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /Деталь установлена\/заменена/ })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Закрыть заявку' })).toBeInTheDocument();
  });

  it('отмечает деталь установленной, не меняя статус заявки', async () => {
    let installedCalled = false;
    mockFetch((url, method, body) => {
      if (url.includes('/ncp/types')) return { body: TYPES };
      if (url.includes('/ncp/stations')) return { body: STATIONS };
      if (url.includes('/ncp/components')) return { body: COMPONENTS };
      if (url.endsWith('/ncp/1/part-installed') && method === 'POST') {
        installedCalled = true;
        expect(body).toEqual({ installed: true });
        return { body: { ...NCP_ITEMS[0], partInstalled: true } };
      }
      if (url.includes('/api/v1/ncp?')) {
        return { body: { items: installedCalled ? [{ ...NCP_ITEMS[0], partInstalled: true }] : NCP_ITEMS, page: 1, pageSize: 25, total: 1 } };
      }
      return undefined;
    });

    render(<NcpScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.click(await screen.findByText('NC-2026-0001'));
    await userEvent.click(screen.getByRole('button', { name: /Деталь установлена\/заменена/ }));

    expect(installedCalled).toBe(true);
    await waitFor(() => expect(screen.getByRole('button', { name: /Отметить деталь не установленной/ })).toBeInTheDocument());
    // Статус заявки остаётся прежним — закрытие это отдельное действие.
    expect(screen.getByRole('button', { name: 'Закрыть заявку' })).toBeInTheDocument();
  });

  it('форма регистрации валидна только при выбранном компоненте и количестве', async () => {
    let created: unknown;
    mockFetch((url, method, body) => {
      if (url.includes('/ncp/types')) return { body: TYPES };
      if (url.includes('/ncp/stations')) return { body: STATIONS };
      if (url.includes('/ncp/components')) return { body: COMPONENTS };
      if (url.includes('/api/v1/ncp?')) return { body: { items: NCP_ITEMS, page: 1, pageSize: 25, total: 1 } };
      if (url.endsWith('/api/v1/ncp') && method === 'POST') {
        created = body;
        return { body: { ...NCP_ITEMS[0], id: 2, number: 'NC-2026-0002' } };
      }
      return undefined;
    });

    render(<NcpScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Зарегистрировать несоответствие' }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('VIN'), 'DEMO-VIN-00002');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Зарегистрировать' }));

    await waitFor(() => expect(created).toMatchObject({ vin: 'DEMO-VIN-00002', componentCode: 'DEMO-CMP-014' }));
  });
});
