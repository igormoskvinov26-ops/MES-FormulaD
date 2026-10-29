import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsScreen } from './ReportsScreen';

const NCP_ITEMS = [
  { id: 1, number: 'NC-1', vin: 'DEMO-VIN-00001', station: '3', componentCode: 'DEMO-CMP-014', componentName: 'Рычаг', quantity: 1, type: 'Брак', operatorComment: null, engineerComment: null, status: 'Открыто', partInstalled: false, createdAt: '2026-10-20T11:00:00', createdBy: 'demo-operator', closedAt: null, closedBy: null },
  { id: 2, number: 'NC-2', vin: 'DEMO-VIN-00002', station: '5', componentCode: 'DEMO-CMP-207', componentName: 'Жгут', quantity: 1, type: 'Пересорт', operatorComment: null, engineerComment: null, status: 'Закрыто', partInstalled: true, createdAt: '2026-10-19T11:00:00', createdBy: 'demo-operator', closedAt: '2026-10-19T12:00:00', closedBy: 'demo-operator' },
];

const DELIVERIES = [
  {
    id: 'd1', supplierCode: 'DEMO-SUP-01', supplierName: 'ООО Деталь-Трейд · ДЕМО', invoiceNumber: 'INV-1',
    invoiceDate: '2026-10-20', accompanyingDocument: null, createdAt: '2026-10-20T10:00:00', createdBy: 'demo-operator',
    status: 'VerifiedWithIssues' as const,
    packages: [
      {
        id: 1, deliveryId: 'd1', huNumber: 'HU-1', status: 'Closed' as const, closedAt: '2026-10-20T11:00:00', closedBy: 'demo-operator',
        isComplete: true, hasIssues: true,
        rows: [
          { id: 10, componentCode: 'DEMO-CMP-031', componentName: 'Диск', plannedQuantity: 20, netWeight: null, grossWeight: null, batch: null, requiredQuantity: 5, okQuantity: 3, defectQuantity: 1, mismatchQuantity: 0, shortageQuantity: 1, discrepancyReason: 'брак', checkedQuantity: 5, isComplete: true, hasIssues: true },
        ],
      },
    ],
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

const session = { userName: 'demo-operator', mode: 'dev' };
const noop = () => {};

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('ReportsScreen', () => {
  it('показывает сводки по плану, NCP и входному контролю', async () => {
    mockFetch((url) => {
      if (url.includes('/production-plan?') && url.includes('statusId=4')) return { body: { items: [], page: 1, pageSize: 1, total: 0 } };
      if (url.includes('/production-plan?') && url.includes('statusId=0')) return { body: { items: [], page: 1, pageSize: 1, total: 2 } };
      if (url.includes('/production-plan?') && url.includes('statusId=1')) return { body: { items: [], page: 1, pageSize: 1, total: 1 } };
      if (url.includes('/production-plan?') && url.includes('statusId=2')) return { body: { items: [], page: 1, pageSize: 1, total: 1 } };
      if (url.includes('/production-plan?') && url.includes('statusId=3')) return { body: { items: [], page: 1, pageSize: 1, total: 0 } };
      if (url.includes('/production-plan?') && !url.includes('statusId')) return { body: { items: [], page: 1, pageSize: 1, total: 4 } };
      if (url.includes('/api/v1/ncp?')) return { body: { items: NCP_ITEMS, page: 1, pageSize: 100, total: 2 } };
      if (url.includes('/incoming-inspection/deliveries?')) return { body: { items: DELIVERIES, page: 1, pageSize: 100, total: 1 } };
      return undefined;
    });

    render(<ReportsScreen session={session} onNavigate={noop} onLogout={noop} />);

    const planCard = (await screen.findByRole('heading', { name: 'Производственный план' })).closest('article')!;
    expect(within(planCard).getByText('4')).toBeInTheDocument(); // всего в плане

    const ncpCard = screen.getByRole('heading', { name: 'Несоответствия (NCP)' }).closest('article')!;
    expect(within(ncpCard).getByText('Брак')).toBeInTheDocument();
    expect(within(ncpCard).getByText('Пересорт')).toBeInTheDocument();

    const incomingCard = screen.getByRole('heading', { name: 'Входной контроль' }).closest('article')!;
    // поставок=1, брак=1, недостача=1 из тестовой строки.
    expect(within(incomingCard).getAllByText('1').length).toBeGreaterThanOrEqual(3);
    expect(within(incomingCard).getByText('Проверено, с замечаниями')).toBeInTheDocument();
  });
});
