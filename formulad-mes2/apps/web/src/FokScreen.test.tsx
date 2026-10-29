import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FokScreen } from './FokScreen';

const CLEAN = {
  vin: 'DEMO-VIN-00003',
  id: 1003,
  seqn: 25,
  modelArticle: 'DEMO-1000',
  modelName: 'Квадроцикл 1000 · ДЕМО',
  engineNumber: 'DEMO-ENGINE-03',
  color: 'Чёрный',
  specificationName: null,
  status: 'complete',
  statusId: 2,
  printDate: null,
  plannedStartDate: null,
  plannedCompleteDate: null,
  plannedShipmentDate: null,
  startDate: null,
  completeDate: null,
  fokDate: null,
};

const BLOCKED = { ...CLEAN, vin: 'DEMO-VIN-00001' };

const NCP = {
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

const session = { userName: 'demo-operator', mode: 'dev' };
const noop = () => {};

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('FokScreen', () => {
  it('изделие без незакрытых деталей разрешает подтверждение', async () => {
    mockFetch((url) => {
      if (url.includes('statusId=2')) return { body: { items: [CLEAN], page: 1, pageSize: 25, total: 1 } };
      if (url.endsWith('/production-plan/DEMO-VIN-00003')) return { body: CLEAN };
      if (url.includes('/ncp/missing-parts')) return { body: [] };
      return undefined;
    });

    render(<FokScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('Сканирование VIN'), 'DEMO-VIN-00003{Enter}');

    await screen.findByLabelText('Найдено изделие DEMO-VIN-00003');
    expect(screen.getByRole('button', { name: 'Подтвердить FOK' })).toBeEnabled();
  });

  it('незакрытая обязательная деталь видна СРАЗУ при сканировании, до попытки подтверждения', async () => {
    let fokCalled = false;
    mockFetch((url, method) => {
      if (url.includes('statusId=2')) return { body: { items: [BLOCKED], page: 1, pageSize: 25, total: 1 } };
      if (url.endsWith('/production-plan/DEMO-VIN-00001')) return { body: BLOCKED };
      if (url.includes('/ncp/missing-parts')) return { body: [NCP] };
      if (url.endsWith('/fok') && method === 'POST') {
        fokCalled = true;
        return { body: { ...BLOCKED, statusId: 3 } };
      }
      return undefined;
    });

    render(<FokScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('Сканирование VIN'), 'DEMO-VIN-00001{Enter}');

    // Причина блокировки видна уже после первого скана — подтверждение ещё не вызывалось.
    expect(await screen.findByRole('status')).toHaveTextContent('NC-2026-0001');
    expect(screen.getByRole('button', { name: 'Подтвердить FOK' })).toBeDisabled();
    expect(fokCalled).toBe(false);
  });

  it('полный путь: статус подходит, деталей не хватает → после отметки установки FOK проходит', async () => {
    let installed = false;
    mockFetch((url, method) => {
      if (url.includes('statusId=2')) return { body: { items: [BLOCKED], page: 1, pageSize: 25, total: 1 } };
      if (url.endsWith('/production-plan/DEMO-VIN-00001')) return { body: BLOCKED };
      if (url.includes('/ncp/missing-parts')) return { body: installed ? [] : [NCP] };
      if (url.endsWith('/fok') && method === 'POST') return { body: { ...BLOCKED, statusId: 3 } };
      return undefined;
    });

    render(<FokScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('Сканирование VIN'), 'DEMO-VIN-00001{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent('NC-2026-0001');

    // Деталь установили (из экрана NCP) — пересканируем то же изделие.
    installed = true;
    await userEvent.type(screen.getByLabelText('Сканирование VIN'), 'DEMO-VIN-00001{Enter}');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Подтвердить FOK' })).toBeEnabled());
  });

  it('заблокированное изделие можно отправить в Rework прямо с экрана FOK', async () => {
    let reworkCalled = false;
    mockFetch((url, method) => {
      if (url.includes('statusId=2')) return { body: { items: [BLOCKED], page: 1, pageSize: 25, total: 1 } };
      if (url.endsWith('/production-plan/DEMO-VIN-00001')) return { body: BLOCKED };
      if (url.includes('/ncp/missing-parts')) return { body: [NCP] };
      if (url.endsWith('/rework') && method === 'POST') {
        reworkCalled = true;
        return { body: { ...BLOCKED, statusId: 4 } };
      }
      return undefined;
    });

    render(<FokScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('Сканирование VIN'), 'DEMO-VIN-00001{Enter}');
    await screen.findByRole('status');

    await userEvent.click(screen.getByRole('button', { name: 'Отправить в Rework' }));

    expect(reworkCalled).toBe(true);
    expect(await screen.findByRole('status')).toHaveTextContent('Rework');
  });

  it('кнопка «Отправить в Rework» не показывается при простом несовпадении статуса', async () => {
    const WRONG_STATUS = { ...CLEAN, vin: 'DEMO-VIN-00009', statusId: 1 };
    mockFetch((url) => {
      if (url.includes('statusId=2')) return { body: { items: [], page: 1, pageSize: 25, total: 0 } };
      if (url.endsWith('/production-plan/DEMO-VIN-00009')) return { body: WRONG_STATUS };
      return undefined;
    });

    render(<FokScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('Сканирование VIN'), 'DEMO-VIN-00009{Enter}');
    await screen.findByRole('status');

    expect(screen.queryByRole('button', { name: 'Отправить в Rework' })).not.toBeInTheDocument();
  });
});
