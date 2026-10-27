import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const ITEMS = [
  {
    vin: 'DEMO-VIN-00001',
    id: 1001,
    seqn: 23,
    specificationName: 'Pathcross 1000 LTD · ДЕМО',
    printDate: '2026-10-12T00:00:00',
    plannedStartDate: '2026-10-12T00:00:00',
    plannedCompleteDate: '2026-10-13T00:00:00',
    modelArticle: 'DEMO-800',
    modelName: 'Квадроцикл 800 · ДЕМО',
    engineNumber: 'DEMO-ENGINE-01',
    color: 'Серый',
    status: 'in progress',
    statusId: 1,
    plannedShipmentDate: '2026-11-15T00:00:00',
    startDate: '2026-10-20T09:00:00',
    completeDate: null,
    fokDate: null,
  },
];

type Route = (url: string) => { status?: number; body?: unknown } | undefined;

function mockFetch(route: Route) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const result = route(url);
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

const session = { userName: 'demo-operator', mode: 'dev', demo: true };

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('App', () => {
  it('показывает план, DEMO-маркер и «—» для пустых дат', async () => {
    mockFetch((url) => {
      if (url.includes('/auth/me')) return { body: session };
      if (url.includes('/statuses')) return { body: ['in progress', null] };
      if (url.includes('/production-plan?')) return { body: { items: ITEMS, page: 1, pageSize: 25, total: 1 } };
      return undefined;
    });

    render(<App />);

    expect(await screen.findByText('DEMO-VIN-00001')).toBeInTheDocument();
    expect(screen.getByText('DEMO')).toBeInTheDocument();
    expect(screen.getByText('Позиций: 1')).toBeInTheDocument();
    // Состояние строки подписано словом, а не только цветом.
    expect(screen.getAllByText('В производстве').length).toBeGreaterThan(0);
  });

  it('по Enter с полным VIN открывает read-only карточку', async () => {
    mockFetch((url) => {
      if (url.includes('/auth/me')) return { body: session };
      if (url.includes('/statuses')) return { body: ['in progress'] };
      if (url.includes('/production-plan?')) return { body: { items: ITEMS, page: 1, pageSize: 25, total: 1 } };
      if (url.endsWith('/production-plan/DEMO-VIN-00001')) return { body: ITEMS[0] };
      return undefined;
    });

    render(<App />);
    const search = await screen.findByLabelText('Поиск VIN или сканирование');

    // Эмуляция сканера: быстрый ввод строки и Enter.
    await userEvent.type(search, 'DEMO-VIN-00001{Enter}');

    expect(await screen.findByLabelText('Карточка изделия DEMO-VIN-00001')).toBeInTheDocument();
    expect(screen.getAllByText('DEMO-ENGINE-01').length).toBeGreaterThan(0);
    // В карточке изделия нет ни одной кнопки: менять производственные данные нельзя.
    const card = screen.getByLabelText('Карточка изделия DEMO-VIN-00001');
    expect(within(card).queryAllByRole('button')).toHaveLength(0);
  });

  it('сообщает «не найден» для отсутствующего VIN', async () => {
    mockFetch((url) => {
      if (url.includes('/auth/me')) return { body: session };
      if (url.includes('/statuses')) return { body: [] };
      if (url.includes('/production-plan?')) return { body: { items: [], page: 1, pageSize: 25, total: 0 } };
      return { status: 404, body: { title: 'Изделие не найдено' } };
    });

    render(<App />);
    const search = await screen.findByLabelText('Поиск VIN или сканирование');
    await userEvent.type(search, 'DEMO-VIN-99999{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('не найден');
    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
  });

  it('показывает экран входа, когда сессии нет (401)', async () => {
    mockFetch(() => ({ status: 401, body: {} }));

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Войти' })).toBeInTheDocument();
  });

  it('показывает «Нет связи с сервером» при сетевой ошибке', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/auth/me')) {
        return new Response(JSON.stringify(session), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new TypeError('network down');
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Нет связи с сервером'));
  });
});
