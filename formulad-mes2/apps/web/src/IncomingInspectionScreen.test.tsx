import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IncomingInspectionScreen } from './IncomingInspectionScreen';

const SUPPLIER = { code: 'DEMO-SUP-01', name: 'ООО Деталь-Трейд · ДЕМО', isParentPlant: false };

const EMPTY_DELIVERY = {
  id: 'd1',
  supplierCode: 'DEMO-SUP-01',
  supplierName: SUPPLIER.name,
  invoiceNumber: 'INV-1',
  invoiceDate: '2026-10-27',
  accompanyingDocument: null,
  createdAt: '2026-10-27T10:00:00',
  createdBy: 'demo-operator',
  packages: [],
  status: 'Open' as const,
};

const ROW_OK = { packageNumber: 'HU-1', article: 'DEMO-CMP-031', componentName: null, quantity: '20', netWeight: null, grossWeight: null, batch: null };
const ROW_BAD = { ...ROW_OK, packageNumber: null, article: 'NOPE' };

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
  return ['HU\tАртикул\tНаименование\tКол-во\tНетто\tБрутто\tПартия', 'строка'].join('\n');
}

describe('IncomingInspectionScreen', () => {
  it('список поставок показывает статус и позволяет создать новую', async () => {
    mockFetch((url, method) => {
      if (url.endsWith('/incoming-inspection/suppliers')) return { body: [SUPPLIER] };
      if (url.endsWith('/incoming-inspection/deliveries?page=1&pageSize=25')) {
        return { body: { items: [], page: 1, pageSize: 25, total: 0 } };
      }
      if (url.endsWith('/incoming-inspection/deliveries') && method === 'POST') {
        return { body: EMPTY_DELIVERY };
      }
      if (url.endsWith('/incoming-inspection/deliveries/d1')) return { body: EMPTY_DELIVERY };
      return undefined;
    });

    render(<IncomingInspectionScreen session={session} onNavigate={noop} onLogout={noop} />);
    await screen.findByText('Поставок пока нет');

    await userEvent.click(screen.getByRole('button', { name: 'Новая поставка' }));
    await userEvent.type(screen.getByLabelText('Номер инвойса'), 'INV-1');
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }));

    expect(await screen.findByText(/Инвойс INV-1/)).toBeInTheDocument();
  });

  it('вставка Packing List с ошибкой блокирует добавление в поставку', async () => {
    mockFetch((url, method) => {
      if (url.endsWith('/incoming-inspection/suppliers')) return { body: [SUPPLIER] };
      if (url.endsWith('/incoming-inspection/deliveries?page=1&pageSize=25')) {
        return { body: { items: [EMPTY_DELIVERY], page: 1, pageSize: 25, total: 1 } };
      }
      if (url.endsWith('/incoming-inspection/deliveries/d1')) return { body: EMPTY_DELIVERY };
      if (url.endsWith('/packing-list/sessions') && method === 'POST') {
        return {
          body: {
            id: 's1', deliveryId: 'd1', createdAt: '2026-10-27T10:00:00', createdBy: 'demo-operator',
            rows: [{ rowNumber: 1, row: ROW_BAD, errors: ['Номер упаковки (HU) не указан', 'Артикул «NOPE» не найден в справочнике — добавьте его в справочник'], previewRequiredQuantity: null }],
            totalCount: 1, errorCount: 1,
          },
        };
      }
      return undefined;
    });

    render(<IncomingInspectionScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.dblClick(await screen.findByText(SUPPLIER.name));
    await screen.findByText(/Инвойс INV-1/);

    await userEvent.type(screen.getByPlaceholderText('Ctrl+V диапазон ячеек'), pasteBlock());
    await userEvent.click(screen.getByRole('button', { name: 'Проверить' }));

    expect(await screen.findByText('Номер упаковки (HU) не указан')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить в поставку' })).toBeDisabled();
  });

  it('подтверждённая загрузка создаёт коробку в списке', async () => {
    const confirmedDelivery = {
      ...EMPTY_DELIVERY,
      packages: [{ id: 1, deliveryId: 'd1', huNumber: 'HU-1', status: 'Open' as const, closedAt: null, closedBy: null, isComplete: false, hasIssues: false, rows: [] }],
    };
    mockFetch((url, method) => {
      if (url.endsWith('/incoming-inspection/suppliers')) return { body: [SUPPLIER] };
      if (url.endsWith('/incoming-inspection/deliveries?page=1&pageSize=25')) {
        return { body: { items: [EMPTY_DELIVERY], page: 1, pageSize: 25, total: 1 } };
      }
      if (url.endsWith('/incoming-inspection/deliveries/d1')) return { body: EMPTY_DELIVERY };
      if (url.endsWith('/packing-list/sessions') && method === 'POST') {
        return {
          body: {
            id: 's1', deliveryId: 'd1', createdAt: '2026-10-27T10:00:00', createdBy: 'demo-operator',
            rows: [{ rowNumber: 1, row: ROW_OK, errors: [], previewRequiredQuantity: 20 }],
            totalCount: 1, errorCount: 0,
          },
        };
      }
      if (url.endsWith('/packing-list/sessions/s1/confirm') && method === 'POST') {
        return { body: confirmedDelivery };
      }
      return undefined;
    });

    render(<IncomingInspectionScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.dblClick(await screen.findByText(SUPPLIER.name));
    await screen.findByText(/Инвойс INV-1/);

    await userEvent.type(screen.getByPlaceholderText('Ctrl+V диапазон ячеек'), pasteBlock());
    await userEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    await screen.findByText('Строк: 1 · Ошибок: 0');

    await userEvent.click(screen.getByRole('button', { name: 'Добавить в поставку' }));

    expect(await screen.findByText('HU-1')).toBeInTheDocument();
  });

  it('двойной клик по коробке открывает диалог; закрытие блокируется, пока не отработан норматив', async () => {
    const openPackage = {
      id: 1, deliveryId: 'd1', huNumber: 'HU-1', status: 'Open' as const, closedAt: null, closedBy: null, isComplete: false, hasIssues: false,
      rows: [
        { id: 10, componentCode: 'DEMO-CMP-031', componentName: 'Диск тормозной передний · ДЕМО', plannedQuantity: 20, netWeight: null, grossWeight: null, batch: null, requiredQuantity: 20, okQuantity: 0, defectQuantity: 0, mismatchQuantity: 0, shortageQuantity: 0, discrepancyReason: null, checkedQuantity: 0, isComplete: false, hasIssues: false },
      ],
    };
    const deliveryWithPackage = { ...EMPTY_DELIVERY, packages: [openPackage] };

    mockFetch((url) => {
      if (url.endsWith('/incoming-inspection/suppliers')) return { body: [SUPPLIER] };
      if (url.endsWith('/incoming-inspection/deliveries?page=1&pageSize=25')) {
        return { body: { items: [deliveryWithPackage], page: 1, pageSize: 25, total: 1 } };
      }
      if (url.endsWith('/incoming-inspection/deliveries/d1')) return { body: deliveryWithPackage };
      return undefined;
    });

    render(<IncomingInspectionScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.dblClick(await screen.findByText(SUPPLIER.name));
    await screen.findByText(/Инвойс INV-1/);

    await userEvent.dblClick(screen.getByText('HU-1'));

    expect(await screen.findByRole('dialog', { name: 'Коробка HU-1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Проверка завершена/ })).toBeDisabled();
  });

  it('запись результата OK обновляет счётчик и разблокирует закрытие коробки', async () => {
    const row = { id: 10, componentCode: 'DEMO-CMP-031', componentName: 'Диск тормозной передний · ДЕМО', plannedQuantity: 20, netWeight: null, grossWeight: null, batch: null, requiredQuantity: 5, okQuantity: 0, defectQuantity: 0, mismatchQuantity: 0, shortageQuantity: 0, discrepancyReason: null, checkedQuantity: 0, isComplete: false, hasIssues: false };
    const openPackage = { id: 1, deliveryId: 'd1', huNumber: 'HU-1', status: 'Open' as const, closedAt: null, closedBy: null, isComplete: false, hasIssues: false, rows: [row] };
    const deliveryWithPackage = { ...EMPTY_DELIVERY, packages: [openPackage] };

    mockFetch((url, method, body) => {
      if (url.endsWith('/incoming-inspection/suppliers')) return { body: [SUPPLIER] };
      if (url.endsWith('/incoming-inspection/deliveries?page=1&pageSize=25')) {
        return { body: { items: [deliveryWithPackage], page: 1, pageSize: 25, total: 1 } };
      }
      if (url.endsWith('/incoming-inspection/deliveries/d1')) return { body: deliveryWithPackage };
      if (url.endsWith('/packages/1/rows/10/result') && method === 'POST') {
        expect(body).toEqual({ outcome: 'OK', quantity: 5, reason: null });
        return { body: { ...openPackage, isComplete: true, rows: [{ ...row, okQuantity: 5, checkedQuantity: 5, isComplete: true }] } };
      }
      return undefined;
    });

    render(<IncomingInspectionScreen session={session} onNavigate={noop} onLogout={noop} />);
    await userEvent.dblClick(await screen.findByText(SUPPLIER.name));
    await screen.findByText(/Инвойс INV-1/);
    await userEvent.dblClick(screen.getByText('HU-1'));
    await screen.findByRole('dialog', { name: 'Коробка HU-1' });

    await userEvent.clear(screen.getByLabelText('Строка DEMO-CMP-031: количество'));
    await userEvent.type(screen.getByLabelText('Строка DEMO-CMP-031: количество'), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Записать' }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Проверка завершена/ })).toBeEnabled());
  });
});
