import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StationScreen } from './StationScreen';

const ITEM = {
  vin: 'DEMO-VIN-00001',
  id: 1001,
  seqn: 23,
  modelArticle: 'DEMO-800',
  modelName: 'Квадроцикл 800 · ДЕМО',
  engineNumber: 'DEMO-ENGINE-01',
  color: 'Серый',
  specificationName: null,
  status: 'in progress',
  statusId: 1,
  printDate: null,
  plannedStartDate: null,
  plannedCompleteDate: null,
  plannedShipmentDate: null,
  startDate: '2026-10-20T09:00:00',
  completeDate: null,
  fokDate: null,
};

const STATIONS = ['3', '6'];
const COMPONENTS = [
  { code: 'DEMO-CMP-014', name: 'Рычаг подвески передний · ДЕМО', station: '3' },
  { code: 'DEMO-CMP-031', name: 'Диск тормозной передний · ДЕМО', station: '3' },
  { code: 'DEMO-CMP-088', name: 'Радиатор охлаждения · ДЕМО', station: '6' },
];
const TYPES = ['Брак', 'Пересорт', 'Недостача', 'Прочее'];

const OPEN_NCP_ON_STATION_6 = {
  id: 9,
  number: 'NC-2026-0009',
  vin: 'DEMO-VIN-00001',
  station: '6',
  componentCode: 'DEMO-CMP-088',
  componentName: 'Радиатор охлаждения · ДЕМО',
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

function baseRoutes(checks: Record<string, unknown>, ncpItems: unknown[]): Route {
  return (url, method) => {
    if (url.includes('/ncp/stations')) return { body: STATIONS };
    if (url.includes('/ncp/components')) return { body: COMPONENTS };
    if (url.includes('/ncp/types')) return { body: TYPES };
    if (url.endsWith('/production-plan/DEMO-VIN-00001')) return { body: ITEM };
    if (url.includes('/stations/DEMO-VIN-00001/checks') && method === 'GET') return { body: checks };
    if (url.includes('/api/v1/ncp?')) return { body: { items: ncpItems, page: 1, pageSize: 100, total: ncpItems.length } };
    return undefined;
  };
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('StationScreen', () => {
  it('после поиска VIN показывает линию станций; незакрытая NCP красит станцию красным', async () => {
    mockFetch(baseRoutes({}, [OPEN_NCP_ON_STATION_6]));

    render(<StationScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('VIN изделия'), 'DEMO-VIN-00001{Enter}');

    expect(await screen.findByRole('button', { name: /Станция 3 — не начата/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Станция 6 — есть несоответствие/ })).toBeInTheDocument();
  });

  it('клик по станции показывает привязанные компоненты', async () => {
    mockFetch(baseRoutes({}, []));

    render(<StationScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('VIN изделия'), 'DEMO-VIN-00001{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: /Станция 3/ }));

    expect(screen.getByText('Рычаг подвески передний · ДЕМО')).toBeInTheDocument();
    expect(screen.getByText('Диск тормозной передний · ДЕМО')).toBeInTheDocument();
    expect(screen.queryByText('Радиатор охлаждения · ДЕМО')).not.toBeInTheDocument();
  });

  it('отметка компонента отправляет запрос и сохраняет автора/время', async () => {
    let checkedCalled = false;
    mockFetch((url, method, body) => {
      if (url.includes('/components/DEMO-CMP-014/check') && method === 'POST') {
        checkedCalled = true;
        expect(body).toEqual({ checked: true });
        return { body: { componentCode: 'DEMO-CMP-014', checked: true, checkedBy: 'demo-operator', checkedAt: '2026-10-27T10:00:00' } };
      }
      return baseRoutes({}, [])(url, method, body);
    });

    render(<StationScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('VIN изделия'), 'DEMO-VIN-00001{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: /Станция 3/ }));
    await userEvent.click(screen.getAllByRole('checkbox')[0]);

    expect(checkedCalled).toBe(true);
    await waitFor(() => expect(screen.getByText(/27\.10\.2026 10:00/)).toBeInTheDocument());
  });

  it('«Проверено всё» отмечает каждый компонент станции', async () => {
    const calledFor: string[] = [];
    mockFetch((url, method, body) => {
      const match = url.match(/components\/([^/]+)\/check$/);
      if (match && method === 'POST') {
        calledFor.push(match[1]);
        expect(body).toEqual({ checked: true });
        return { body: { componentCode: match[1], checked: true, checkedBy: 'demo-operator', checkedAt: '2026-10-27T10:00:00' } };
      }
      return baseRoutes({}, [])(url, method, body);
    });

    render(<StationScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('VIN изделия'), 'DEMO-VIN-00001{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: /Станция 3/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Проверено всё' }));

    await waitFor(() => expect(calledFor.sort()).toEqual(['DEMO-CMP-014', 'DEMO-CMP-031']));
  });

  it('«Зафиксировать расхождение» открывает форму NCP с готовым VIN и станцией', async () => {
    let created: unknown;
    mockFetch((url, method, body) => {
      if (url.endsWith('/api/v1/ncp') && method === 'POST') {
        created = body;
        return { body: { ...OPEN_NCP_ON_STATION_6, id: 10, number: 'NC-2026-0010' } };
      }
      return baseRoutes({}, [])(url, method, body);
    });

    render(<StationScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('VIN изделия'), 'DEMO-VIN-00001{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: /Станция 3/ }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Зафиксировать расхождение' })[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('VIN')).toHaveValue('DEMO-VIN-00001');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Зарегистрировать' }));

    await waitFor(() =>
      expect(created).toMatchObject({ vin: 'DEMO-VIN-00001', station: '3', componentCode: 'DEMO-CMP-014' }),
    );
  });
});
