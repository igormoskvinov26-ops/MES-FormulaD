import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobCardDialog } from './JobCardDialog';

const ITEM_A = {
  vin: 'DEMO-VIN-00001',
  id: 1001,
  seqn: 23,
  modelArticle: 'DEMO-800',
  modelName: 'Квадроцикл 800 · ДЕМО',
  engineNumber: 'DEMO-ENGINE-01',
  color: 'Серый',
  specificationName: 'Pathcross 1000 LTD · ДЕМО',
  status: 'in progress',
  statusId: 1,
  printDate: null,
  plannedStartDate: null,
  plannedCompleteDate: null,
  plannedShipmentDate: null,
  startDate: null,
  completeDate: null,
  fokDate: null,
};

const ITEM_B = { ...ITEM_A, vin: 'DEMO-VIN-00002', id: 1002, seqn: 24 };

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

const noop = () => {};

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('JobCardDialog', () => {
  it('показывает поля изделия и QR для одной карточки', async () => {
    mockFetch(() => undefined);
    render(<JobCardDialog items={[ITEM_A]} onClose={noop} />);

    expect(await screen.findByRole('dialog', { name: 'JobCard DEMO-VIN-00001' })).toBeInTheDocument();
    expect(screen.getByText('DEMO-ENGINE-01')).toBeInTheDocument();
    expect(screen.getByText('1001')).toBeInTheDocument();
    // jsdom не умеет canvas — QR рисуется в запасной вариант с тем же VIN в подписи.
    expect(screen.getByLabelText(/QR-код[^]*DEMO-VIN-00001/)).toBeInTheDocument();
  });

  it('печать нескольких изделий рендерит по карточке на каждое', async () => {
    mockFetch(() => undefined);
    render(<JobCardDialog items={[ITEM_A, ITEM_B]} onClose={noop} />);

    expect(await screen.findByRole('dialog', { name: 'JobCard — 2 изделий' })).toBeInTheDocument();
    expect(screen.getAllByText(/DEMO-ENGINE-01|DEMO-VIN-00002/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Печать (2)' })).toBeInTheDocument();
  });

  it('«Печать» отмечает PrintDate для каждого изделия перед открытием системной печати', async () => {
    const printed: string[] = [];
    mockFetch((url, method) => {
      const match = url.match(/production-plan\/([^/]+)\/print$/);
      if (match && method === 'POST') {
        printed.push(match[1]);
        return { body: { ...ITEM_A, vin: match[1], printDate: '2026-10-27T12:00:00' } };
      }
      return undefined;
    });
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);

    render(<JobCardDialog items={[ITEM_A, ITEM_B]} onClose={noop} />);
    await userEvent.click(screen.getByRole('button', { name: 'Печать (2)' }));

    await waitFor(() => expect(printed.sort()).toEqual(['DEMO-VIN-00001', 'DEMO-VIN-00002']));
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('ошибка отметки печати не блокирует системную печать', async () => {
    mockFetch(() => ({ status: 500, body: {} }));
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);

    render(<JobCardDialog items={[ITEM_A]} onClose={noop} />);
    await userEvent.click(screen.getByRole('button', { name: 'Печать' }));

    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('alert')).toHaveTextContent('дату печати');
  });

  it('«Закрыть» вызывает onClose', async () => {
    mockFetch(() => undefined);
    const onClose = vi.fn();
    render(<JobCardDialog items={[ITEM_A]} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
