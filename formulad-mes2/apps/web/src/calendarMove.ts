import type { ProductionPlanItem } from './api';
import { scheduleItems, timeToMinutes, type CalendarConfig, type Slot } from './calendar';

/**
 * Перенос карточки в календаре = перестановка в плане (`POST /production-plan/{vin}/move`).
 * Серверная операция: изделие занимает позицию (SEQN) целевого изделия, остальные сдвигаются, набор номеров не меняется.
 * Здесь — чистая логика: какую позицию отправить, как выглядит порядок после переноса и что изменится в прогнозе.
 * Двигать можно только запланированные изделия с позицией в плане (решение 4 концепции календаря).
 */
const PINNED = new Set([1, 2, 4]);

/** Можно ли двигать: есть позиция в плане и изделие ещё не начато (ФОК в календарь не входит). */
export const isMovable = (item: ProductionPlanItem) => item.seqn !== null && item.statusId !== 3 && !PINNED.has(item.statusId ?? -1);

/** Порядок плана, как на сервере: по SEQN, без позиции — в конец, затем по VIN. */
export function planOrder(items: ProductionPlanItem[]): ProductionPlanItem[] {
  return [...items].sort((a, b) => (a.seqn === null ? 1 : 0) - (b.seqn === null ? 1 : 0) || (a.seqn ?? 0) - (b.seqn ?? 0) || (a.vin < b.vin ? -1 : a.vin > b.vin ? 1 : 0));
}

export type MovePlan = { toPosition: number } | { noop: true } | { error: string };

/**
 * Позиция для `move`, чтобы изделие `vin` встало ПЕРЕД изделием `beforeVin` (null — в конец очереди запланированных).
 * Сервер ставит изделие на место целевого: вверх — перед ним, вниз — после него; поэтому при переносе вниз целью
 * берётся предыдущее перед `beforeVin` изделие.
 */
export function movePosition(items: ProductionPlanItem[], vin: string, beforeVin: string | null): MovePlan {
  const all = planOrder(items).filter((i) => i.seqn !== null);
  const idxX = all.findIndex((i) => i.vin === vin);
  if (idxX < 0) return { error: 'У изделия нет позиции в плане' };
  if (!isMovable(all[idxX])) return { error: 'Изделие уже в работе: в календаре оно закреплено' };

  if (beforeVin === null) {
    // конец очереди запланированных: после последнего запланированного изделия
    const lastPlanned = all.map((i, k) => (isMovable(i) ? k : -1)).filter((k) => k >= 0).pop() ?? idxX;
    if (lastPlanned === idxX) return { noop: true };
    return { toPosition: all[lastPlanned].seqn! };
  }
  const idxB = all.findIndex((i) => i.vin === beforeVin);
  if (idxB < 0) return { error: 'Целевое изделие не найдено в плане' };
  if (idxB === idxX) return { noop: true };
  if (idxX > idxB) return { toPosition: all[idxB].seqn! }; // вверх: на место целевого, оно уйдёт вниз
  if (idxB - 1 === idxX) return { noop: true }; // уже стоит прямо перед целевым
  return { toPosition: all[idxB - 1].seqn! }; // вниз: после предыдущего перед целевым
}

/** Порядок плана после `move` — зеркало серверной операции (DemoProductionPlanReader.MoveAsync). */
export function applyMove(items: ProductionPlanItem[], vin: string, toPosition: number): ProductionPlanItem[] {
  const ordered = planOrder(items).filter((i) => i.seqn !== null);
  const positions = ordered.map((i) => i.seqn!);
  const targetIndex = positions.indexOf(toPosition);
  const fromIndex = ordered.findIndex((i) => i.vin === vin);
  if (targetIndex < 0 || fromIndex < 0) return planOrder(items);
  const [moved] = ordered.splice(fromIndex, 1);
  ordered.splice(targetIndex, 0, moved);
  const renumbered = new Map(ordered.map((item, index) => [item.vin, positions[index]] as const));
  return planOrder(items.map((i) => (renumbered.has(i.vin) ? { ...i, seqn: renumbered.get(i.vin)! } : i)));
}

/** Первое запланированное изделие (кроме `exceptVin`), слот которого не раньше точки (дата, минута дня); null — после всех. */
export function beforeVinForPoint(slots: Slot[], exceptVin: string, date: string, minute: number): string | null {
  const next = slots.find((s) => !s.pinned && s.item.vin !== exceptVin && (s.date > date || (s.date === date && timeToMinutes(s.time) >= minute)));
  return next ? next.item.vin : null;
}

export type MovePreview = {
  toPosition: number;
  from: Slot;
  to: Slot;
  /** Изделия, у которых изменились день или время выпуска (включая переносимое). */
  changed: { vin: string; from: Slot; to: Slot }[];
  dayChanged: number;
  earlier: number;
  later: number;
};

/** Что изменится в прогнозе при переносе: для окна подтверждения. */
export function previewMove(items: ProductionPlanItem[], now: Date, cfg: CalendarConfig, vin: string, beforeVin: string | null): MovePreview | { noop: true } | { error: string } {
  const plan = movePosition(items, vin, beforeVin);
  if (!('toPosition' in plan)) return plan;
  const before = scheduleItems(planOrder(items), now, cfg);
  const after = scheduleItems(applyMove(items, vin, plan.toPosition), now, cfg);
  const was = new Map(before.map((s) => [s.item.vin, s]));
  const changed: MovePreview['changed'] = [];
  for (const s of after) {
    const old = was.get(s.item.vin);
    if (old && (old.date !== s.date || old.time !== s.time)) changed.push({ vin: s.item.vin, from: old, to: s });
  }
  const key = (s: Slot) => `${s.date}T${s.time}`;
  const moved = changed.find((c) => c.vin === vin);
  if (!moved) return { noop: true };
  return {
    toPosition: plan.toPosition,
    from: moved.from,
    to: moved.to,
    changed,
    dayChanged: changed.filter((c) => c.from.date !== c.to.date).length,
    earlier: changed.filter((c) => key(c.to) < key(c.from)).length,
    later: changed.filter((c) => key(c.to) > key(c.from)).length,
  };
}
