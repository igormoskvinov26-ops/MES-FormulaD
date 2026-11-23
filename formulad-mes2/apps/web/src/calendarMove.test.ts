import { describe, expect, it } from 'vitest';
import type { ProductionPlanItem } from './api';
import { DEFAULT_CONFIG, scheduleItems } from './calendar';
import { applyMove, beforeVinForPoint, isMovable, movePosition, planOrder, previewMove } from './calendarMove';

function item(vin: string, seqn: number | null, statusId: number | null = 0): ProductionPlanItem {
  return {
    vin, id: 1, seqn, modelArticle: null, modelName: null, engineNumber: null, color: null, specificationName: null, status: null, statusId,
    printDate: null, plannedStartDate: null, plannedCompleteDate: null, plannedShipmentDate: null, startDate: null, completeDate: null, fokDate: null,
  };
}
const PLAN = [item('W', 10, 1), item('A', 20), item('B', 30), item('C', 40), item('D', 50), item('E', 60), item('F', 70, 3), item('NOPOS', null)];
const order = (items: ProductionPlanItem[]) => planOrder(items).map((i) => i.vin).join('');
const MON = new Date('2026-11-09T07:00:00');

describe('isMovable', () => {
  it('двигаются только запланированные с позицией; начатые, ФОК и без позиции — нет', () => {
    expect(PLAN.filter(isMovable).map((i) => i.vin)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});

describe('movePosition + applyMove', () => {
  const run = (vin: string, before: string | null) => {
    const p = movePosition(PLAN, vin, before);
    return 'toPosition' in p ? order(applyMove(PLAN, vin, p.toPosition)) : p;
  };
  it('вверх: C перед A → WCABDEF', () => expect(run('C', 'A')).toBe('WCABDEFNOPOS'));
  it('вниз: A перед D → WBCADEF (после C, перед D)', () => expect(run('A', 'D')).toBe('WBCADEFNOPOS'));
  it('на соседнюю позицию вверх: C перед B → WACBDEF', () => expect(run('C', 'B')).toBe('WACBDEFNOPOS'));
  it('в конец очереди запланированных: B → после E, перед изделием с ФОК', () => expect(run('B', null)).toBe('WACDEBFNOPOS'));
  it('уже на месте — ничего не делаем', () => {
    expect(run('B', 'C')).toEqual({ noop: true });
    expect(run('B', 'B')).toEqual({ noop: true });
    expect(run('E', null)).toEqual({ noop: true });
  });
  it('закреплённое, без позиции и неизвестное — отказ с причиной', () => {
    expect(run('W', 'A')).toEqual({ error: 'Изделие уже в работе: в календаре оно закреплено' });
    expect(run('NOPOS', 'A')).toEqual({ error: 'У изделия нет позиции в плане' });
    expect(movePosition(PLAN, 'A', 'ZZZ')).toEqual({ error: 'Целевое изделие не найдено в плане' });
  });
  it('набор номеров позиций не меняется, меняется только кому какой достался', () => {
    const p = movePosition(PLAN, 'D', 'A') as { toPosition: number };
    const after = applyMove(PLAN, 'D', p.toPosition);
    expect(after.map((i) => i.seqn).filter((s) => s !== null).sort()).toEqual([10, 20, 30, 40, 50, 60, 70]);
  });
});

describe('beforeVinForPoint', () => {
  it('первое запланированное изделие не раньше точки, закреплённые не считаются, переносимое исключается', () => {
    const slots = scheduleItems(planOrder(PLAN), MON, DEFAULT_CONFIG);
    expect(beforeVinForPoint(slots, 'X', '2026-11-09', 10 * 60)).toBe('B');
    expect(beforeVinForPoint(slots, 'B', '2026-11-09', 10 * 60)).toBe('C');
    expect(beforeVinForPoint(slots, 'X', '2026-11-09', 7 * 60)).toBe('A');
    expect(beforeVinForPoint(slots, 'X', '2026-11-10', 0)).toBeNull();
  });
});

describe('previewMove', () => {
  it('перенос вниз: переносимое изделие и сдвинутые соседи с подсчётом «раньше/позже»', () => {
    const p = previewMove(PLAN, MON, DEFAULT_CONFIG, 'A', 'D');
    if (!('toPosition' in p)) throw new Error('ожидался предпросмотр');
    expect(p.from.time).toBe('09:00');
    expect(p.to.time).toBe('11:00');
    expect(p.changed.map((c) => c.vin).sort()).toEqual(['A', 'B', 'C']);
    expect(p.later).toBe(1);
    expect(p.earlier).toBe(2);
  });
  it('перенос, при котором что-то уходит на другой день, считается в dayChanged', () => {
    const many = [item('W', 1, 1), ...Array.from({ length: 8 }, (_, i) => item(`P${i + 1}`, 10 + i))];
    const p = previewMove(many, MON, DEFAULT_CONFIG, 'P1', null);
    if (!('toPosition' in p)) throw new Error('ожидался предпросмотр');
    expect(p.dayChanged).toBeGreaterThanOrEqual(1);
  });
  it('перенос на то же место и недопустимый перенос не дают предпросмотра', () => {
    expect(previewMove(PLAN, MON, DEFAULT_CONFIG, 'B', 'C')).toEqual({ noop: true });
    expect('error' in previewMove(PLAN, MON, DEFAULT_CONFIG, 'W', 'A')).toBe(true);
  });
});
