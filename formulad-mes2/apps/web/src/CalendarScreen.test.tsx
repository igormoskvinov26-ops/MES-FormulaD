import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarScreen } from './CalendarScreen';

function item(vin: string, statusId: number | null, plannedCompleteDate: string | null = null) {
  return {
    vin, id: 1, seqn: 1, modelArticle: 'DEMO-800', modelName: 'Квадроцикл 800', engineNumber: null, color: 'Красный',
    specificationName: null, status: null, statusId, printDate: null, plannedStartDate: null, plannedCompleteDate,
    plannedShipmentDate: null, startDate: null, completeDate: null, fokDate: null,
  };
}

const ITEMS = [item('WORK-1', 1, '2026-11-06T00:00:00'), ...Array.from({ length: 8 }, (_, i) => item(`PLAN-${i + 1}`, 0)), item('FOK-1', 3)];
const MONDAY_MORNING = new Date('2026-11-09T07:00:00');

const SETTINGS = { workdays: [1, 2, 3, 4, 5], shiftStart: '08:00', shiftEnd: '17:00', breaks: [{ from: '12:00', to: '13:00' }], perShift: 8 };
type Day = { date: string; kind: 'off' | 'work'; from: string | null; to: string | null; note: string | null };
let calendarDays: Day[];
let controlPosts: { name: string; afterStation: string }[];
let puts: unknown[];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  calendarDays = [];
  controlPosts = [];
  puts = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/calendar/days') && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as { changes: { date: string; kind: 'off' | 'work' | null; from?: string | null; to?: string | null; note?: string | null }[] };
      puts.push(body.changes);
      for (const c of body.changes) {
        calendarDays = calendarDays.filter((d) => d.date !== c.date);
        if (c.kind) calendarDays.push({ date: c.date, kind: c.kind, from: c.from ?? null, to: c.to ?? null, note: c.note ?? null });
      }
      return json({ settings: { ...SETTINGS, controlPosts }, days: calendarDays });
    }
    if (url.includes('/calendar')) return json({ settings: { ...SETTINGS, controlPosts }, days: calendarDays });
    if (url.includes('/ncp/stations')) return json(['1', '2', '3', '4']);
    if (url.includes('/ncp/components')) return json([{ code: 'C1', name: 'Деталь 1', station: '1' }, { code: 'C2', name: 'Деталь 2', station: '2' }, { code: 'C3', name: 'Деталь 3', station: '2' }]);
    if (url.includes('/checks')) return json({ C1: { checked: true, checkedBy: 'op', checkedAt: '2026-11-09T09:00:00' } });
    if (url.includes('/api/v1/ncp?')) return json({ items: [], page: 1, pageSize: 100, total: 0 });
    return json({ items: ITEMS, page: 1, pageSize: 100, total: ITEMS.length });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const session = { userName: 'demo-operator', mode: 'dev' };
const noop = () => {};

describe('CalendarScreen — неделя', () => {
  it('раскладывает очередь по дням, закрепляет начатое и не показывает изделия с ФОК', async () => {
    render(<CalendarScreen session={session} onNavigate={noop} onLogout={noop} now={MONDAY_MORNING} />);

    const monday = await screen.findByRole('region', { name: /Пн 9 ноября/ });
    expect(within(monday).getAllByRole('article')).toHaveLength(8);
    expect(within(monday).getByText('8 из 8')).toBeInTheDocument();
    expect(within(monday).getByLabelText(/WORK-1/)).toHaveTextContent('закреплено');
    expect(within(monday).getByLabelText(/WORK-1/)).toHaveTextContent('+3 дн');

    const tuesday = screen.getByRole('region', { name: /Вт 10 ноября/ });
    expect(within(tuesday).getAllByRole('article')).toHaveLength(1);
    expect(screen.queryByLabelText(/FOK-1/)).not.toBeInTheDocument();
  });

  it('выходные подписаны, переключатель ракурсов показывает текущий', async () => {
    render(<CalendarScreen session={session} onNavigate={noop} onLogout={noop} now={MONDAY_MORNING} />);
    await screen.findByRole('region', { name: /Пн 9 ноября/ });
    expect(within(screen.getByRole('region', { name: /Сб 14 ноября/ })).getByText('выходной')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Неделя$/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^День$/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('переключение недель и возврат на «Сегодня»', async () => {
    render(<CalendarScreen session={session} onNavigate={noop} onLogout={noop} now={MONDAY_MORNING} />);
    await screen.findByRole('region', { name: /Пн 9 ноября/ });

    await userEvent.click(screen.getByRole('button', { name: 'Следующая неделя' }));
    expect(screen.getByRole('region', { name: /Пн 16 ноября/ })).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Предыдущая неделя' }));
    await userEvent.click(screen.getByRole('button', { name: 'Предыдущая неделя' }));
    expect(screen.getByRole('region', { name: /Пн 2 ноября/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Сегодня' }));
    expect(screen.getByRole('region', { name: /Пн 9 ноября/ })).toBeInTheDocument();
  });

  it('праздник из календаря: день выходной с примечанием, очередь уходит на следующие дни', async () => {
    calendarDays = [{ date: '2026-11-09', kind: 'off', from: null, to: null, note: 'Праздник' }];
    render(<CalendarScreen session={session} onNavigate={noop} onLogout={noop} now={MONDAY_MORNING} />);

    const monday = await screen.findByRole('region', { name: /Пн 9 ноября/ });
    expect(within(monday).getByText(/выходной · Праздник/)).toBeInTheDocument();
    expect(within(monday).queryAllByRole('article')).toHaveLength(0);
    expect(within(screen.getByRole('region', { name: /Вт 10 ноября/ })).getAllByRole('article')).toHaveLength(8);
  });
});

describe('CalendarScreen — настройка дня и «Пересчитать план»', () => {
  it('«ОК» только запоминает изменение, прогноз меняется после «Пересчитать план»', async () => {
    render(<CalendarScreen session={session} onNavigate={noop} onLogout={noop} now={MONDAY_MORNING} />);
    const monday = await screen.findByRole('region', { name: /Пн 9 ноября/ });
    expect(within(monday).getAllByRole('article')).toHaveLength(8);
    expect(screen.queryByRole('button', { name: 'Пересчитать план' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Настроить день 9 ноября' }));
    const dialog = screen.getByRole('dialog', { name: /Настройка дня/ });
    await userEvent.click(within(dialog).getByLabelText('Праздник / выходной'));
    await userEvent.type(within(dialog).getByLabelText('Примечание'), 'Тест');
    await userEvent.click(within(dialog).getByRole('button', { name: 'ОК' }));

    expect(screen.getByText(/Изменений календаря:/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /Пн 9 ноября/ })).getByText(/изменено → выходной/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /Пн 9 ноября/ })).getAllByRole('article')).toHaveLength(8);
    expect(puts).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Пересчитать план' }));
    expect(await screen.findByText('План пересчитан по новому графику.')).toBeInTheDocument();
    expect(puts).toEqual([[{ date: '2026-11-09', kind: 'off', from: null, to: null, note: 'Тест' }]]);
    expect(within(screen.getByRole('region', { name: /Пн 9 ноября/ })).queryAllByRole('article')).toHaveLength(0);
    expect(within(screen.getByRole('region', { name: /Вт 10 ноября/ })).getAllByRole('article')).toHaveLength(8);
    expect(screen.queryByRole('button', { name: 'Пересчитать план' })).not.toBeInTheDocument();
  });

  it('сокращённые часы дня уменьшают вместимость; «Отменить изменения» сбрасывает черновик', async () => {
    render(<CalendarScreen session={session} onNavigate={noop} onLogout={noop} now={MONDAY_MORNING} />);
    await screen.findByRole('region', { name: /Пн 9 ноября/ });

    await userEvent.click(screen.getByRole('button', { name: 'Настроить день 9 ноября' }));
    const dialog = screen.getByRole('dialog', { name: /Настройка дня/ });
    fireEvent.change(within(dialog).getByLabelText('до'), { target: { value: '16:00' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'ОК' }));
    await userEvent.click(screen.getByRole('button', { name: 'Пересчитать план' }));

    const monday = await screen.findByRole('region', { name: /Пн 9 ноября/ });
    await waitFor(() => expect(within(monday).getByText(/7 из 7/)).toBeInTheDocument());
    expect(puts).toEqual([[{ date: '2026-11-09', kind: 'work', from: '08:00', to: '16:00', note: null }]]);

    await userEvent.click(screen.getByRole('button', { name: 'Настроить день 10 ноября' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: /Настройка дня/ })).getByLabelText('Праздник / выходной'));
    await userEvent.click(within(screen.getByRole('dialog', { name: /Настройка дня/ })).getByRole('button', { name: 'ОК' }));
    expect(screen.getByText(/Изменений календаря:/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Отменить изменения' }));
    expect(screen.queryByText(/Изменений календаря:/)).not.toBeInTheDocument();
  });

  it('возврат дня к стандартному графику не считается изменением', async () => {
    render(<CalendarScreen session={session} onNavigate={noop} onLogout={noop} now={MONDAY_MORNING} />);
    await screen.findByRole('region', { name: /Пн 9 ноября/ });
    await userEvent.click(screen.getByRole('button', { name: 'Настроить день 9 ноября' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: /Настройка дня/ })).getByRole('button', { name: 'ОК' }));
    expect(screen.queryByText(/Изменений календаря:/)).not.toBeInTheDocument();
  });
});


describe('CalendarScreen — день, месяц, прогресс сборки', () => {
  it('«День»: почасовая сетка, перерыв, слоты в своих часах, переходы по дням', async () => {
    render(<CalendarScreen session={session} onNavigate={noop} onLogout={noop} now={MONDAY_MORNING} />);
    await screen.findByRole('region', { name: /Пн 9 ноября/ });
    await userEvent.click(screen.getByRole('button', { name: /^День$/ }));

    const hours = screen.getByRole('list', { name: 'Часы дня' });
    expect(within(hours).getAllByRole('listitem')).toHaveLength(9);
    expect(within(hours).getByLabelText('12:00 — перерыв')).toBeInTheDocument();
    expect(within(within(hours).getByLabelText('08:00')).getByText(/WORK-1/)).toBeInTheDocument();
    expect(within(within(hours).getByLabelText('13:00')).getAllByRole('article')).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Следующий день' }));
    expect(screen.getByRole('region', { name: /Вт 10 ноября/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Следующий день' }));
    await userEvent.click(screen.getByRole('button', { name: 'Следующий день' }));
    await userEvent.click(screen.getByRole('button', { name: 'Следующий день' }));
    await userEvent.click(screen.getByRole('button', { name: 'Следующий день' }));
    expect(screen.getByText(/Выходной день/)).toBeInTheDocument();
  });

  it('клик по дню недели открывает «День», в «Месяце» видны загрузка и выходные, клик по клетке открывает день', async () => {
    render(<CalendarScreen session={session} onNavigate={noop} onLogout={noop} now={MONDAY_MORNING} />);
    await screen.findByRole('region', { name: /Пн 9 ноября/ });
    await userEvent.click(screen.getByRole('button', { name: 'Открыть день 10 ноября' }));
    expect(screen.getByRole('main', { name: 'День' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Месяц$/ }));
    expect(screen.getByRole('main', { name: 'Месяц' })).toBeInTheDocument();
    expect(screen.getByText('ноябрь 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '9 ноября: 8 из 8' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '14 ноября: выходной' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '9 ноября: 8 из 8' }));
    expect(screen.getByRole('main', { name: 'День' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Пн 9 ноября/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Месяц$/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Следующий месяц' }));
    expect(screen.getByText('декабрь 2026')).toBeInTheDocument();
  });

  it('клик по изделию открывает «Прогресс сборки»: шапка и линия станций с текущей станцией', async () => {
    render(<CalendarScreen session={session} onNavigate={noop} onLogout={noop} now={MONDAY_MORNING} />);
    await screen.findByRole('region', { name: /Пн 9 ноября/ });

    await userEvent.click(screen.getByLabelText(/Изделие WORK-1/));
    const dialog = await screen.findByRole('dialog', { name: 'Прогресс сборки WORK-1' });
    expect(within(dialog).getByText('Квадроцикл 800 · Красный')).toBeInTheDocument();
    expect(within(dialog).getByText(/Прогноз выпуска/)).toBeInTheDocument();

    const line = await within(dialog).findByLabelText('Линия станций');
    expect(within(line).getByLabelText('Станция 1 — выполнено')).toBeInTheDocument();
    expect(within(line).getByLabelText('Станция 2 — не начата')).toHaveAttribute('data-current', 'true');
    expect(within(line).getByText('0 из 2')).toBeInTheDocument();
  });
});

describe('CalendarScreen — посты контроля качества в «Прогрессе сборки»', () => {
  it('заданные посты стоят на линии после своих станций; без постов — подсказка, где их задать', async () => {
    controlPosts = [{ name: 'Пост 1', afterStation: '2' }];
    const { unmount } = render(<CalendarScreen session={session} onNavigate={noop} onLogout={noop} now={MONDAY_MORNING} />);
    await screen.findByRole('region', { name: /Пн 9 ноября/ });
    await userEvent.click(screen.getByLabelText(/Изделие WORK-1/));
    const line = await within(await screen.findByRole('dialog', { name: 'Прогресс сборки WORK-1' })).findByLabelText('Линия станций');
    expect(within(line).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual([
      'Станция 1 — выполнено', 'Станция 2 — не начата', 'Пост контроля качества: Пост 1', 'Станция 3 — не начата', 'Станция 4 — не начата',
    ].map((s) => s)) ;
    expect(screen.queryByText(/Посты контроля качества не заданы/)).not.toBeInTheDocument();
    unmount();

    controlPosts = [];
    render(<CalendarScreen session={session} onNavigate={noop} onLogout={noop} now={MONDAY_MORNING} />);
    await screen.findByRole('region', { name: /Пн 9 ноября/ });
    await userEvent.click(screen.getByLabelText(/Изделие WORK-1/));
    expect(await screen.findByText(/Посты контроля качества не заданы/)).toBeInTheDocument();
  });
});

describe('CalendarScreen — история выпуска', () => {
  it('изделие с ФОК показано в прошедшем дне как «выпущено», не двигается и не входит в загрузку прогноза', async () => {
    const released = { ...item('FOK-2', 3, '2026-11-03T00:00:00'), fokDate: '2026-11-05T15:30:00' };
    (ITEMS as unknown[]).push(released);
    try {
      render(<CalendarScreen session={session} onNavigate={noop} onLogout={noop} now={MONDAY_MORNING} />);
      await screen.findByRole('region', { name: /Пн 9 ноября/ });
      await userEvent.click(screen.getByRole('button', { name: 'Предыдущая неделя' }));

      const thursday = await screen.findByRole('region', { name: /Чт 5 ноября/ });
      const card = within(thursday).getByLabelText(/Изделие FOK-2, 15:30/);
      expect(card).toHaveTextContent('выпущено');
      expect(card).toHaveTextContent('+2 дн');
      expect(card).toHaveAttribute('draggable', 'false');
      expect(within(card).queryByRole('button', { name: /Действия с изделием/ })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Изделие FOK-1/)).not.toBeInTheDocument();
    } finally {
      (ITEMS as unknown[]).pop();
    }
  });
});
