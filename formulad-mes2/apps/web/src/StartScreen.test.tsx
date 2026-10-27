import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StartScreen } from './StartScreen';

const PLANNED = {
  vin: 'DEMO-VIN-00002',
  id: 1002,
  seqn: 24,
  modelArticle: 'DEMO-800',
  modelName: 'Квадроцикл 800 · ДЕМО',
  engineNumber: 'DEMO-ENGINE-02',
  color: 'Красный',
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

const IN_WORK = { ...PLANNED, vin: 'DEMO-VIN-00001', status: 'in progress', statusId: 1 };

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

describe('StartScreen', () => {
  it('показывает список ожидающих запуска (statusId=0)', async () => {
    mockFetch((url) => {
      if (url.includes('statusId=0')) return { body: { items: [PLANNED], page: 1, pageSize: 25, total: 1 } };
      return undefined;
    });

    render(<StartScreen session={session} onNavigate={noop} onLogout={noop} />);

    expect(await screen.findByText('DEMO-VIN-00002')).toBeInTheDocument();
  });

  it('первый скан показывает карточку, второй скан того же VIN подтверждает переход', async () => {
    let started = false;
    mockFetch((url, method) => {
      if (url.includes('statusId=0')) {
        return { body: { items: started ? [] : [PLANNED], page: 1, pageSize: 25, total: started ? 0 : 1 } };
      }
      if (url.endsWith('/production-plan/DEMO-VIN-00002') && method === 'GET') return { body: PLANNED };
      if (url.endsWith('/production-plan/DEMO-VIN-00002/start') && method === 'POST') {
        started = true;
        return { body: { ...PLANNED, statusId: 1, status: 'in progress', startDate: '2026-10-27T12:00:00' } };
      }
      return undefined;
    });

    render(<StartScreen session={session} onNavigate={noop} onLogout={noop} />);
    const input = screen.getByLabelText('Сканирование VIN');

    // первый скан — поиск
    await userEvent.type(input, 'DEMO-VIN-00002{Enter}');
    expect(await screen.findByLabelText('Найдено изделие DEMO-VIN-00002')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeEnabled();

    // второй скан того же VIN — подтверждение
    await userEvent.type(input, 'DEMO-VIN-00002{Enter}');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Готово'));
    expect(started).toBe(true);
  });

  it('кнопка подтверждения тоже работает, не только повторный скан', async () => {
    mockFetch((url, method) => {
      if (url.includes('statusId=0')) return { body: { items: [PLANNED], page: 1, pageSize: 25, total: 1 } };
      if (url.endsWith('/production-plan/DEMO-VIN-00002') && method === 'GET') return { body: PLANNED };
      if (url.endsWith('/production-plan/DEMO-VIN-00002/start') && method === 'POST') {
        return { body: { ...PLANNED, statusId: 1 } };
      }
      return undefined;
    });

    render(<StartScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('Сканирование VIN'), 'DEMO-VIN-00002{Enter}');
    await screen.findByLabelText('Найдено изделие DEMO-VIN-00002');

    await userEvent.click(screen.getByRole('button', { name: 'Запустить' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Готово'));
  });

  it('изделие в неподходящем статусе показывает ошибку и блокирует кнопку', async () => {
    mockFetch((url, method) => {
      if (url.includes('statusId=0')) return { body: { items: [PLANNED], page: 1, pageSize: 25, total: 1 } };
      if (url.endsWith('/production-plan/DEMO-VIN-00001') && method === 'GET') return { body: IN_WORK };
      return undefined;
    });

    render(<StartScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('Сканирование VIN'), 'DEMO-VIN-00001{Enter}');

    expect(await screen.findByRole('status')).toHaveTextContent('перевести нельзя');
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeDisabled();
  });

  it('неизвестный VIN даёт понятную ошибку и не ломает экран', async () => {
    mockFetch((url) => {
      if (url.includes('statusId=0')) return { body: { items: [PLANNED], page: 1, pageSize: 25, total: 1 } };
      return { status: 404 };
    });

    render(<StartScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('Сканирование VIN'), 'DEMO-VIN-99999{Enter}');

    expect(await screen.findByRole('status')).toHaveTextContent('не найден');
  });
});
