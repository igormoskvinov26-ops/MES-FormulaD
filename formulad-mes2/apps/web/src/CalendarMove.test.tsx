import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductionPlanItem } from './api';
import { applyMove, planOrder } from './calendarMove';
import { CalendarScreen } from './CalendarScreen';

function item(vin: string, seqn: number, statusId: number): ProductionPlanItem {
  return {
    vin, id: seqn, seqn, modelArticle: 'DEMO-800', modelName: 'Квадроцикл 800', engineNumber: null, color: 'Красный', specificationName: null,
    status: null, statusId, printDate: null, plannedStartDate: null, plannedCompleteDate: null, plannedShipmentDate: null,
    startDate: null, completeDate: null, fokDate: null,
  };
}
const SETTINGS = { workdays: [1, 2, 3, 4, 5], shiftStart: '08:00', shiftEnd: '17:00', breaks: [{ from: '12:00', to: '13:00' }], perShift: 8 };
const MONDAY = new Date('2026-11-09T07:00:00');
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const session = { userName: 'demo-operator', mode: 'dev' };
const noop = () => {};

let plan: ProductionPlanItem[];
let moves: { vin: string; toPosition: number }[];
let failMove: boolean;

beforeEach(() => {
  plan = [item('W', 10, 1), item('P1', 20, 0), item('P2', 30, 0), item('P3', 40, 0)];
  moves = [];
  failMove = false;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const m = /\/production-plan\/([^/]+)\/move$/.exec(url);
    if (m && init?.method === 'POST') {
      if (failMove) return new Response(JSON.stringify({ title: 'x', detail: 'Позиция не найдена' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      const body = JSON.parse(String(init.body)) as { toPosition: number };
      moves.push({ vin: m[1], toPosition: body.toPosition });
      plan = applyMove(plan, m[1], body.toPosition);
      return json(plan.find((i) => i.vin === m[1]));
    }
    if (url.includes('/calendar')) return json({ settings: SETTINGS, days: [] });
    if (url.includes('/ncp/stations')) return json(['1']);
    if (url.includes('/ncp/components')) return json([]);
    if (url.includes('/checks')) return json({});
    if (url.includes('/api/v1/ncp?')) return json({ items: [], page: 1, pageSize: 100, total: 0 });
    return json({ items: planOrder(plan), page: 1, pageSize: 100, total: plan.length });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const monday = () => screen.findByRole('region', { name: /Пн 9 ноября/ });
const order = (region: HTMLElement) => within(region).getAllByRole('article').map((a) => /Изделие (\S+),/.exec(a.getAttribute('aria-label') ?? '')![1]);

describe('Календарь — перенос карточек', () => {
  it('Alt+↓: подтверждение с последствиями → перенос → «Отменить перенос» возвращает порядок', async () => {
    render(<CalendarScreen session={session} onNavigate={noop} onLogout={noop} now={MONDAY} />);
    expect(order(await monday())).toEqual(['W', 'P1', 'P2', 'P3']);

    fireEvent.keyDown(screen.getByLabelText(/Изделие P1,/), { key: 'ArrowDown', altKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'Перенос изделия P1' });
    expect(dialog).toHaveTextContent('9 ноября, 09:00');
    expect(dialog).toHaveTextContent('9 ноября, 10:00');
    expect(within(dialog).getByText(/Сдвинется по времени ещё/)).toBeInTheDocument();
    expect(moves).toHaveLength(0);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Перенести' }));
    expect(await screen.findByText(/Изделие P1 перенесено/)).toBeInTheDocument();
    expect(moves).toEqual([{ vin: 'P1', toPosition: 30 }]);
    expect(order(await monday())).toEqual(['W', 'P2', 'P1', 'P3']);

    await userEvent.click(screen.getByRole('button', { name: 'Отменить перенос' }));
    expect(await screen.findByText('Перенос изделия P1 отменён.')).toBeInTheDocument();
    expect(moves.at(-1)).toEqual({ vin: 'P1', toPosition: 20 });
    expect(order(await monday())).toEqual(['W', 'P1', 'P2', 'P3']);
    expect(screen.queryByRole('button', { name: 'Отменить перенос' })).not.toBeInTheDocument();
  });

  it('перетаскивание карточки на другую: перед ней, с подтверждением; «Отмена» ничего не меняет', async () => {
    render(<CalendarScreen session={session} onNavigate={noop} onLogout={noop} now={MONDAY} />);
    await monday();
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    const p3 = screen.getByLabelText(/Изделие P3,/);
    const p1 = screen.getByLabelText(/Изделие P1,/);
    expect(p3).toHaveAttribute('draggable', 'true');

    fireEvent.dragStart(p3, { dataTransfer });
    fireEvent.dragOver(p1, { dataTransfer });
    fireEvent.drop(p1, { dataTransfer });

    const dialog = await screen.findByRole('dialog', { name: 'Перенос изделия P3' });
    await userEvent.click(within(dialog).getByRole('button', { name: /Отмена/ }));
    expect(screen.queryByRole('dialog', { name: /Перенос изделия/ })).not.toBeInTheDocument();
    expect(moves).toHaveLength(0);

    fireEvent.dragStart(p3, { dataTransfer });
    fireEvent.drop(p1, { dataTransfer });
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Перенос изделия P3' })).getByRole('button', { name: 'Перенести' }));
    await waitFor(() => expect(moves).toEqual([{ vin: 'P3', toPosition: 20 }]));
    expect(order(await monday())).toEqual(['W', 'P3', 'P1', 'P2']);
  });

  it('закреплённое изделие не перетаскивается и не переносится с клавиатуры', async () => {
    render(<CalendarScreen session={session} onNavigate={noop} onLogout={noop} now={MONDAY} />);
    await monday();
    const w = screen.getByLabelText(/Изделие W,/);
    expect(w).toHaveAttribute('draggable', 'false');
    fireEvent.keyDown(w, { key: 'ArrowDown', altKey: true });
    expect(screen.queryByRole('dialog', { name: /Перенос изделия/ })).not.toBeInTheDocument();
  });

  it('крайние положения: Alt+↑ у первого и Alt+↓ у последнего запланированного — сообщение, а не перенос', async () => {
    render(<CalendarScreen session={session} onNavigate={noop} onLogout={noop} now={MONDAY} />);
    await monday();
    fireEvent.keyDown(screen.getByLabelText(/Изделие P1,/), { key: 'ArrowUp', altKey: true });
    expect(await screen.findByText(/уже первое в очереди/)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText(/Изделие P3,/), { key: 'ArrowDown', altKey: true });
    expect(await screen.findByText(/уже последнее в очереди/)).toBeInTheDocument();
    expect(moves).toHaveLength(0);
  });

  it('отказ сервера при переносе показывается в окне, порядок не меняется', async () => {
    failMove = true;
    render(<CalendarScreen session={session} onNavigate={noop} onLogout={noop} now={MONDAY} />);
    await monday();
    fireEvent.keyDown(screen.getByLabelText(/Изделие P2,/), { key: 'ArrowUp', altKey: true });
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Перенос изделия P2' })).getByRole('button', { name: 'Перенести' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Позиция не найдена');
    expect(order(await monday())).toEqual(['W', 'P1', 'P2', 'P3']);
  });

  it('кнопка «⋮»: «В начало очереди» и «В конец очереди» работают без мыши и перетаскивания', async () => {
    render(<CalendarScreen session={session} onNavigate={noop} onLogout={noop} now={MONDAY} />);
    await monday();

    await userEvent.click(screen.getByRole('button', { name: 'Действия с изделием P2' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'В начало очереди' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Перенос изделия P2' })).getByRole('button', { name: 'Перенести' }));
    await waitFor(() => expect(moves).toEqual([{ vin: 'P2', toPosition: 20 }]));
    expect(order(await monday())).toEqual(['W', 'P2', 'P1', 'P3']);

    await userEvent.click(screen.getByRole('button', { name: 'Действия с изделием P2' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'В конец очереди' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Перенос изделия P2' })).getByRole('button', { name: 'Перенести' }));
    await waitFor(() => expect(moves.at(-1)).toEqual({ vin: 'P2', toPosition: 40 }));
    expect(order(await monday())).toEqual(['W', 'P1', 'P3', 'P2']);
  });

  it('меню: открытие не открывает «Прогресс сборки», у закреплённого изделия меню нет, у первого «выше» даёт сообщение', async () => {
    render(<CalendarScreen session={session} onNavigate={noop} onLogout={noop} now={MONDAY} />);
    await monday();
    expect(screen.queryByRole('button', { name: 'Действия с изделием W' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Действия с изделием P1' }));
    expect(screen.queryByRole('dialog', { name: /Прогресс сборки/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'На место выше' }));
    expect(await screen.findByText(/уже первое в очереди/)).toBeInTheDocument();
    expect(moves).toHaveLength(0);
  });
});
