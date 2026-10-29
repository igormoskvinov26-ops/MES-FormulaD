import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportScreen } from './ImportScreen';

const REFERENCE = {
  models: [{ article: 'DEMO-800', name: 'Квадроцикл 800 · ДЕМО' }],
  colors: ['Серый', 'Красный'],
  specifications: ['Базовая'],
};

const RAW_ROW_OK = {
  vin: 'DEMO-VIN-00099',
  modelArticle: 'DEMO-800',
  engineNumber: 'DEMO-ENGINE-99',
  color: 'Серый',
  specificationName: 'Базовая',
  plannedStartDate: '2026-11-01',
  plannedCompleteDate: '2026-11-05',
  plannedShipmentDate: '2026-11-10',
};

const RAW_ROW_BAD = { ...RAW_ROW_OK, vin: null, color: 'Фиолетовый' };

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

function pasteBlock() {
  return ['VIN\tАртикул\tДвигатель\tЦвет\tКомплектация\tСтарт\tЗавершение\tОтгрузка', 'строка'].join('\n');
}

describe('ImportScreen', () => {
  it('вставка диапазона и проверка показывают чистую строку без ошибок', async () => {
    mockFetch((url, method) => {
      if (url.endsWith('/plan-import/reference')) return { body: REFERENCE };
      if (url.endsWith('/plan-import/sessions') && method === 'POST') {
        return {
          body: {
            id: 's1',
            createdAt: '2026-10-27T10:00:00',
            createdBy: 'demo-operator',
            source: 'paste',
            rows: [{ rowNumber: 1, row: RAW_ROW_OK, errors: [] }],
            totalCount: 1,
            errorCount: 0,
          },
        };
      }
      return undefined;
    });

    render(<ImportScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('Вставка диапазона из Excel'), pasteBlock());
    await userEvent.click(screen.getByRole('button', { name: 'Проверить' }));

    expect(await screen.findByText('Строк: 1 · Ошибок: 0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Загрузить производственный план' })).toBeEnabled();
  });

  it('строка с ошибками подсвечена, ошибки перечислены, публикация заблокирована', async () => {
    mockFetch((url, method) => {
      if (url.endsWith('/plan-import/reference')) return { body: REFERENCE };
      if (url.endsWith('/plan-import/sessions') && method === 'POST') {
        return {
          body: {
            id: 's1',
            createdAt: '2026-10-27T10:00:00',
            createdBy: 'demo-operator',
            source: 'paste',
            rows: [{ rowNumber: 1, row: RAW_ROW_BAD, errors: ['VIN обязателен', 'Неизвестный цвет: Фиолетовый'] }],
            totalCount: 1,
            errorCount: 1,
          },
        };
      }
      return undefined;
    });

    render(<ImportScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('Вставка диапазона из Excel'), pasteBlock());
    await userEvent.click(screen.getByRole('button', { name: 'Проверить' }));

    expect(await screen.findByText('VIN обязателен')).toBeInTheDocument();
    expect(screen.getByText('Неизвестный цвет: Фиолетовый')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Загрузить производственный план' })).toBeDisabled();
  });

  it('исправление строки через выпадающий список цвета повторно проверяет загрузку', async () => {
    let fixed = false;
    mockFetch((url, method) => {
      if (url.endsWith('/plan-import/reference')) return { body: REFERENCE };
      if (url.endsWith('/plan-import/sessions') && method === 'POST') {
        return {
          body: {
            id: 's1',
            createdAt: '2026-10-27T10:00:00',
            createdBy: 'demo-operator',
            source: 'paste',
            rows: [{ rowNumber: 1, row: RAW_ROW_BAD, errors: ['VIN обязателен', 'Неизвестный цвет: Фиолетовый'] }],
            totalCount: 1,
            errorCount: 1,
          },
        };
      }
      if (url.endsWith('/plan-import/sessions/s1/rows/1') && method === 'PUT') {
        fixed = true;
        return {
          body: {
            id: 's1',
            createdAt: '2026-10-27T10:00:00',
            createdBy: 'demo-operator',
            source: 'paste',
            rows: [{ rowNumber: 1, row: { ...RAW_ROW_BAD, color: 'Красный' }, errors: ['VIN обязателен'] }],
            totalCount: 1,
            errorCount: 1,
          },
        };
      }
      return undefined;
    });

    render(<ImportScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('Вставка диапазона из Excel'), pasteBlock());
    await userEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    await screen.findByText('Неизвестный цвет: Фиолетовый');

    await userEvent.selectOptions(screen.getByLabelText('Строка 1: цвет'), 'Красный');

    await waitFor(() => expect(fixed).toBe(true));
    expect(await screen.findByText('Строк: 1 · Ошибок: 1')).toBeInTheDocument();
    expect(screen.queryByText('Неизвестный цвет: Фиолетовый')).not.toBeInTheDocument();
  });

  it('публикация без ошибок добавляет изделия и показывает сообщение об успехе', async () => {
    mockFetch((url, method) => {
      if (url.endsWith('/plan-import/reference')) return { body: REFERENCE };
      if (url.endsWith('/plan-import/sessions') && method === 'POST') {
        return {
          body: {
            id: 's1',
            createdAt: '2026-10-27T10:00:00',
            createdBy: 'demo-operator',
            source: 'paste',
            rows: [{ rowNumber: 1, row: RAW_ROW_OK, errors: [] }],
            totalCount: 1,
            errorCount: 0,
          },
        };
      }
      if (url.endsWith('/plan-import/sessions/s1/publish') && method === 'POST') {
        return { body: { published: 1 } };
      }
      return undefined;
    });

    render(<ImportScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.type(screen.getByLabelText('Вставка диапазона из Excel'), pasteBlock());
    await userEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    await screen.findByText('Строк: 1 · Ошибок: 0');

    await userEvent.click(screen.getByRole('button', { name: 'Загрузить производственный план' }));

    expect(await screen.findByText(/Добавлено изделий: 1/)).toBeInTheDocument();
  });
});
