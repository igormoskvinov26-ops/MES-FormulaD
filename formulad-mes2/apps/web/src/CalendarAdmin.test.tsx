import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarAdmin } from './CalendarAdmin';

let SETTINGS = { workdays: [1, 2, 3, 4, 5], shiftStart: '08:00', shiftEnd: '17:00', breaks: [{ from: '12:00', to: '13:00' }], perShift: 8 };
type Day = { date: string; kind: 'off' | 'work'; from: string | null; to: string | null; note: string | null };
let days: Day[];
let puts: { date: string; kind: 'off' | 'work' | null; from?: string | null; to?: string | null; note?: string | null }[][];
let failNext: string | null;
let settingsPuts: unknown[];
const DEFAULT_SETTINGS = { workdays: [1, 2, 3, 4, 5], shiftStart: '08:00', shiftEnd: '17:00', breaks: [{ from: '12:00', to: '13:00' }], perShift: 8 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  days = [];
  puts = [];
  failNext = null;
  settingsPuts = [];
  SETTINGS = { ...DEFAULT_SETTINGS };
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/ncp/stations')) return json(['1', '2', '3', '4']);
    if (init?.method === 'PUT' && String(input).includes('/calendar/settings')) {
      if (failNext) return json({ title: 'x', detail: failNext }, 400);
      SETTINGS = JSON.parse(String(init.body));
      settingsPuts.push(SETTINGS);
      return json({ settings: SETTINGS, days });
    }
    if (init?.method === 'PUT') {
      if (failNext) return json({ title: 'Некорректное изменение календаря', detail: failNext }, 400);
      const { changes } = JSON.parse(String(init.body)) as { changes: (typeof puts)[number] };
      puts.push(changes);
      for (const c of changes) {
        days = days.filter((d) => d.date !== c.date);
        if (c.kind) days.push({ date: c.date, kind: c.kind, from: c.from ?? null, to: c.to ?? null, note: c.note ?? null });
      }
    }
    return json({ settings: SETTINGS, days });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const paste = (text: string) => fireEvent.change(screen.getByLabelText('Вставка календаря из Excel'), { target: { value: text } });

describe('CalendarAdmin', () => {
  it('загрузка из Excel: проверка → предпросмотр → загрузка → отметки видны в списке', async () => {
    render(<CalendarAdmin />);
    await screen.findByText(/отметок нет/);

    paste('Дата	Тип	С	По	Примечание
04.11.2026	Праздник			День народного единства
14.11.2026	Рабочий	09:00	15:00	Перенос');
    await userEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    const result = await screen.findByLabelText('Результат проверки');
    expect(within(result).getByText('Строк: 2 · Ошибок: 0')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Загрузить в календарь' }));
    expect(await screen.findByText('Загружено дней: 2.')).toBeInTheDocument();
    expect(puts).toHaveLength(1);
    expect(puts[0].map((c) => c.date)).toEqual(['2026-11-04', '2026-11-14']);

    const list = screen.getByLabelText('Отметки календаря');
    expect(within(list).getByText('День народного единства')).toBeInTheDocument();
    expect(within(list).getByText('09:00–15:00')).toBeInTheDocument();
  });

  it('ошибки в строках блокируют загрузку и называют номера строк', async () => {
    render(<CalendarAdmin />);
    await screen.findByText(/отметок нет/);
    paste('04.11.2026	Выходной
99.99.2026	Выходной
05.11.2026	Отпуск');
    await userEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(await screen.findByText(/Строка 2: Не дата/)).toBeInTheDocument();
    expect(screen.getByText(/Строка 3: Неизвестный тип/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Загрузить в календарь' })).toBeDisabled();
    expect(puts).toHaveLength(0);
  });

  it('ручное добавление и удаление отметки', async () => {
    render(<CalendarAdmin />);
    await screen.findByText(/отметок нет/);
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-12-31' } });
    fireEvent.change(screen.getByLabelText('Примечание'), { target: { value: 'Новый год' } });
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    expect(await screen.findByText('Добавлено: 31.12.2026.')).toBeInTheDocument();
    expect(puts[0]).toEqual([{ date: '2026-12-31', kind: 'off', from: null, to: null, note: 'Новый год' }]);

    await userEvent.click(await screen.findByRole('button', { name: 'Удалить отметку 31.12.2026' }));
    await waitFor(() => expect(puts[1]).toEqual([{ date: '2026-12-31', kind: null }]));
    expect(await screen.findByText(/отметок нет/)).toBeInTheDocument();
  });

  it('отказ сервера показывается пользователю с причиной', async () => {
    render(<CalendarAdmin />);
    await screen.findByText(/отметок нет/);
    failNext = '2026-11-04: Начало рабочего дня должно быть раньше конца.';
    paste('04.11.2026	Выходной');
    await userEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Загрузить в календарь' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Начало рабочего дня должно быть раньше конца');
  });

  it('график работы: правка производительности, часов и дней → «Сохранить график» отправляет настройки', async () => {
    render(<CalendarAdmin />);
    const form = await screen.findByLabelText('График работы');
    expect(within(form).getByRole('button', { name: 'Сохранить график' })).toBeDisabled();

    fireEvent.change(within(form).getByLabelText('Изделий в смену'), { target: { value: '12' } });
    fireEvent.change(within(form).getAllByLabelText('до')[0], { target: { value: '18:00' } });
    await userEvent.click(within(form).getByLabelText('Сб'));
    expect(within(form).getByText(/одно изделие примерно каждые/)).toBeInTheDocument();

    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить график' }));
    expect(await screen.findByText(/График работы сохранён/)).toBeInTheDocument();
    expect(settingsPuts).toEqual([{ workdays: [1, 2, 3, 4, 5, 6], shiftStart: '08:00', shiftEnd: '18:00', breaks: [{ from: '12:00', to: '13:00' }], perShift: 12 }]);
  });

  it('график работы: неверные данные показывают причину и не дают сохранить; перерывы добавляются и удаляются', async () => {
    render(<CalendarAdmin />);
    const form = await screen.findByLabelText('График работы');

    await userEvent.click(within(form).getByRole('button', { name: 'Удалить перерыв 1' }));
    expect(within(form).queryByLabelText('Перерыв с')).not.toBeInTheDocument();
    await userEvent.click(within(form).getByRole('button', { name: 'Добавить перерыв' }));
    fireEvent.change(within(form).getByLabelText('Перерыв с'), { target: { value: '07:00' } });
    expect(within(form).getByRole('alert')).toHaveTextContent('внутри смены');
    expect(within(form).getByRole('button', { name: 'Сохранить график' })).toBeDisabled();

    fireEvent.change(within(form).getByLabelText('Перерыв с'), { target: { value: '12:00' } });
    expect(within(form).queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.click(within(form).getByRole('button', { name: 'Отменить правки' }));
    expect(within(form).getByLabelText('Перерыв с')).toHaveValue('12:00');
  });

  it('отказ сервера при сохранении графика показывается с причиной', async () => {
    render(<CalendarAdmin />);
    const form = await screen.findByLabelText('График работы');
    fireEvent.change(within(form).getByLabelText('Изделий в смену'), { target: { value: '9' } });
    failNext = 'Изделий в смену не может быть больше, чем рабочих минут.';
    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить график' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('не может быть больше');
  });

  it('посты контроля качества: добавить, выбрать станцию, сохранить — уходят в настройки', async () => {
    render(<CalendarAdmin />);
    const form = await screen.findByLabelText('График работы');
    await userEvent.click(within(form).getByRole('button', { name: 'Добавить пост контроля' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('выберите станцию');
    expect(within(form).getByRole('button', { name: 'Сохранить график' })).toBeDisabled();

    fireEvent.change(within(form).getByLabelText('Название'), { target: { value: 'Пост входной' } });
    fireEvent.change(within(form).getByLabelText('Стоит после станции'), { target: { value: '4' } });
    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить график' }));
    expect(await screen.findByText(/График работы сохранён/)).toBeInTheDocument();
    expect(settingsPuts).toEqual([{ ...DEFAULT_SETTINGS, controlPosts: [{ name: 'Пост входной', afterStation: '4' }] }]);

    await userEvent.click(within(form).getByRole('button', { name: 'Удалить пост контроля 1' }));
    expect(within(form).queryByLabelText('Название')).not.toBeInTheDocument();
  });

  it('матрица «год × месяцы»: показывает, что формат распознан по описанию, и даёт предпросмотр', async () => {
    render(<CalendarAdmin />);
    await screen.findByText(/отметок нет/);
    paste(['Год/Месяц;Январь;Февраль;Март;Апрель;Май;Июнь;Июль;Август;Сентябрь;Октябрь;Ноябрь;Декабрь', '2026;1,2,3;22*;;;1,9+;;;;;;3*,4;31*'].join('\n'));
    await userEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    const result = await screen.findByLabelText('Результат проверки');
    expect(within(result).getByText(/Распознан формат «год × месяцы»/)).toBeInTheDocument();
    expect(within(result).getByText(/не проверялся на файле с официального сайта/)).toBeInTheDocument();
    expect(within(result).getByText('Строк: 9 · Ошибок: 0')).toBeInTheDocument();
  });
});
