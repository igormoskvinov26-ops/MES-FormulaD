import { useEffect, useMemo, useState } from 'react';
import { AppHeader, type Screen } from './AppHeader';
import { ApiError, api, type CalendarState, type ProductionPlanItem } from './api';
import { AssemblyProgress } from './AssemblyProgress';
import { WEEKDAYS_SHORT, addDays, addMonths, configFrom, dayInfo, mondayOf, parseYmd, releasedSlots, scheduleItems, ymd, type Slot } from './calendar';
import { beforeVinForPoint, isMovable, previewMove } from './calendarMove';
import { DayView, MONTHS_NOMINATIVE, MonthView, WeekView, dayLabel, type Dnd } from './CalendarViews';
import { MoveConfirmDialog } from './MoveConfirmDialog';
import { DaySettingsDialog, type DayDraft } from './DaySettingsDialog';
import { EmptyState } from './EmptyState';
import './f7-components.css';

type View = 'day' | 'week' | 'month';
const VIEWS: { key: View; label: string }[] = [
  { key: 'day', label: 'День' },
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
];

async function loadPlan(): Promise<ProductionPlanItem[]> {
  const all: ProductionPlanItem[] = [];
  for (let page = 1; page <= 50; page++) {
    const result = await api.plan({ page, pageSize: 100 });
    all.push(...result.items);
    if (all.length >= result.total || result.items.length === 0) break;
  }
  return all;
}

function titleOf(view: View, anchor: string) {
  if (view === 'day') return `${WEEKDAYS_SHORT[(parseYmd(anchor).getDay() || 7) - 1]}, ${dayLabel(anchor)} ${parseYmd(anchor).getFullYear()}`;
  if (view === 'month') return `${MONTHS_NOMINATIVE[parseYmd(anchor).getMonth()]} ${parseYmd(anchor).getFullYear()}`;
  const monday = mondayOf(anchor);
  const sunday = addDays(monday, 6);
  return `${dayLabel(monday)} — ${dayLabel(sunday)} ${parseYmd(sunday).getFullYear()}`;
}

function step(view: View, anchor: string, dir: 1 | -1) {
  if (view === 'day') return addDays(anchor, dir);
  if (view === 'week') return addDays(anchor, 7 * dir);
  return addMonths(anchor, dir);
}

export function CalendarScreen({
  session,
  onNavigate,
  onLogout,
  now: nowProp,
}: {
  session: { userName: string | null; mode: string };
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
  now?: Date;
}) {
  const now = useMemo(() => nowProp ?? new Date(), [nowProp]);
  const today = ymd(now);
  const [items, setItems] = useState<ProductionPlanItem[] | null>(null);
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(today);
  const [drafts, setDrafts] = useState<Record<string, DayDraft>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [opened, setOpened] = useState<Slot | null>(null);
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState('');
  const [dragVin, setDragVin] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [move, setMove] = useState<{ vin: string; beforeVin: string | null } | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState('');
  const [lastMove, setLastMove] = useState<{ vin: string; fromSeqn: number } | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([loadPlan(), api.calendar()])
      .then(([all, cal]) => {
        if (!alive) return;
        setItems(all);
        setCalendar(cal);
      })
      .catch((e: unknown) => alive && setError(e instanceof ApiError && e.status === 401 ? 'Нет доступа' : 'Нет связи с сервером'));
    return () => {
      alive = false;
    };
  }, []);

  const cfg = useMemo(() => (calendar ? configFrom(calendar.settings, calendar.days) : null), [calendar]);
  const slots = useMemo(() => (items && cfg ? [...releasedSlots(items), ...scheduleItems(items, now, cfg)] : []), [items, cfg, now]);
  const draftCount = Object.keys(drafts).length;
  const preview = useMemo(() => {
    if (!move || !items || !cfg) return null;
    const p = previewMove(items, now, cfg, move.vin, move.beforeVin);
    return 'toPosition' in p ? p : null;
  }, [move, items, cfg, now]);

  const reloadPlan = async () => setItems(await loadPlan());

  const requestMove = (vin: string, beforeVin: string | null) => {
    setDragVin(null);
    setOver(null);
    setNotice('');
    setError('');
    if (!items || !cfg) return;
    const p = previewMove(items, now, cfg, vin, beforeVin);
    if ('noop' in p) return void setNotice('Изделие уже стоит на этом месте.');
    if ('error' in p) return void setError(p.error);
    setMoveError('');
    setMove({ vin, beforeVin });
  };

  const confirmMove = async () => {
    if (!move || !preview || !items) return;
    const fromSeqn = items.find((i) => i.vin === move.vin)?.seqn ?? null;
    setMoving(true);
    setMoveError('');
    try {
      await api.move(move.vin, preview.toPosition);
      await reloadPlan();
      setLastMove(fromSeqn === null ? null : { vin: move.vin, fromSeqn });
      setNotice(`Изделие ${move.vin} перенесено: ${dayLabel(preview.from.date)}, ${preview.from.time} → ${dayLabel(preview.to.date)}, ${preview.to.time}.`);
      setMove(null);
    } catch (e) {
      setMoveError(e instanceof ApiError && e.detail ? e.detail : 'Не удалось перенести изделие. Обновите страницу: порядок плана мог измениться.');
    } finally {
      setMoving(false);
    }
  };

  const undoMove = async () => {
    if (!lastMove) return;
    setMoving(true);
    try {
      await api.move(lastMove.vin, lastMove.fromSeqn);
      await reloadPlan();
      setNotice(`Перенос изделия ${lastMove.vin} отменён.`);
      setLastMove(null);
    } catch {
      setError('Не удалось отменить перенос. Обновите страницу и верните изделие вручную на экране «Производственный план».');
    } finally {
      setMoving(false);
    }
  };

  const planned = slots.filter((s) => !s.pinned);
  const dnd: Dnd = {
    dragVin,
    over,
    isMovable: (s) => isMovable(s.item),
    onDragStart: setDragVin,
    onDragEnd: () => {
      setDragVin(null);
      setOver(null);
    },
    onOver: setOver,
    onDropBefore: (slot) => dragVin && requestMove(dragVin, slot.pinned ? (planned.find((s) => s.item.vin !== dragVin)?.item.vin ?? null) : slot.item.vin),
    onDropAt: (date, minute) => dragVin && requestMove(dragVin, beforeVinForPoint(slots, dragVin, date, minute)),
    onMoveTo: (slot, where) => {
      if (where === 'first') requestMove(slot.item.vin, planned.find((s) => s.item.vin !== slot.item.vin)?.item.vin ?? null);
      else requestMove(slot.item.vin, null);
    },
    onKeyMove: (slot, dir) => {
      const i = planned.findIndex((s) => s.item.vin === slot.item.vin);
      if (dir === -1) {
        if (i <= 0) return void setNotice('Изделие уже первое в очереди запланированных.');
        requestMove(slot.item.vin, planned[i - 1].item.vin);
      } else {
        if (i < 0 || i >= planned.length - 1) return void setNotice('Изделие уже последнее в очереди запланированных.');
        requestMove(slot.item.vin, planned[i + 2]?.item.vin ?? null);
      }
    },
  };

  const recalc = async () => {
    setApplying(true);
    setError('');
    try {
      const next = await api.calendarApply(Object.entries(drafts).map(([date, d]) => ({ date, kind: d.kind, from: d.from, to: d.to, note: d.note })));
      setCalendar(next);
      setDrafts({});
      setNotice('План пересчитан по новому графику.');
    } catch (e) {
      setError(e instanceof ApiError && e.detail ? e.detail : 'Не удалось сохранить изменения календаря');
    } finally {
      setApplying(false);
    }
  };

  const saveDraft = (date: string, draft: DayDraft) => {
    const current = cfg?.overrides[date] ?? null;
    const same = draft.kind === null ? current === null : current !== null && current.kind === draft.kind && current.from === draft.from && current.to === draft.to && current.note === draft.note;
    setDrafts((prev) => {
      const next = { ...prev };
      if (same) delete next[date];
      else next[date] = draft;
      return next;
    });
    setNotice('');
    setEditing(null);
  };

  const openDay = (date: string) => {
    setAnchor(date);
    setView('day');
  };

  const shared = cfg && { cfg, slots, today, drafts, onEditDay: setEditing, onOpenDay: openDay, onOpenItem: setOpened, dnd };

  return (
    <div className="app f7plan">
      <AppHeader screen="calendar" onNavigate={onNavigate} session={session} onLogout={onLogout} />

      <div className="f7plan__title">
        <span className="f7mes__slash" aria-hidden="true" />
        <div>
          <h1>ПРОИЗВОДСТВЕННЫЙ КАЛЕНДАРЬ</h1>
          <small>Прогноз выпуска по очереди плана и производительности линии</small>
        </div>
      </div>

      <section className="cal__bar" aria-label="Управление календарём">
        <div className="cal__views" role="group" aria-label="Ракурс">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" aria-pressed={view === v.key} onClick={() => setView(v.key)}>{v.label}</button>
          ))}
        </div>
        <div className="cal__nav">
          <button type="button" aria-label={view === 'day' ? 'Предыдущий день' : view === 'week' ? 'Предыдущая неделя' : 'Предыдущий месяц'} onClick={() => setAnchor(step(view, anchor, -1))}>&#x2039;</button>
          <strong className="cal__range">{titleOf(view, anchor)}</strong>
          <button type="button" aria-label={view === 'day' ? 'Следующий день' : view === 'week' ? 'Следующая неделя' : 'Следующий месяц'} onClick={() => setAnchor(step(view, anchor, 1))}>&#x203a;</button>
          <button type="button" onClick={() => setAnchor(today)}>Сегодня</button>
        </div>
      </section>

      {cfg && (
        <p className="cal__assumptions">
          Прогноз по графику: {cfg.perShift} изделий в смену, смена {cfg.shiftStart}–{cfg.shiftEnd}
          {cfg.breaks.map((b) => ` (перерыв ${b.from}–${b.to})`).join('')}, рабочие дни: {cfg.workdays.map((d) => WEEKDAYS_SHORT[d - 1]).join(', ')}.
          Выходные, праздники и особые часы дня — кнопкой ⦿ в шапке дня или в «Администрирование → Производственный календарь».
          Плановые даты в данных не меняются; «+N дн» — прогноз позже плановой даты завершения. Клик по изделию открывает «Прогресс сборки».
        </p>
      )}

      {draftCount > 0 && (
        <section className="cal__recalc" role="status" aria-label="Изменения календаря">
          <span>Изменений календаря: <strong>{draftCount}</strong>. Прогноз пока построен по прежнему графику.</span>
          <button type="button" className="primary" disabled={applying} onClick={() => void recalc()}>
            {applying ? 'Пересчёт…' : 'Пересчитать план'}
          </button>
          <button type="button" disabled={applying} onClick={() => setDrafts({})}>Отменить изменения</button>
        </section>
      )}
      {(notice || lastMove) && (
        <p className="cal__notice" role="status">
          {notice}
          {lastMove && (
            <button type="button" className="cal__undo" disabled={moving} onClick={() => void undoMove()}>Отменить перенос</button>
          )}
        </p>
      )}

      {error && (
        <p role="alert" className="error" style={{ margin: '12px 24px 0' }}>
          {error}
        </p>
      )}

      {!items && !error && <p className="muted" style={{ margin: '16px 24px' }} role="status">Загрузка…</p>}

      {items && shared && view === 'week' && <WeekView anchor={anchor} {...shared} />}
      {items && shared && view === 'day' && <DayView anchor={anchor} {...shared} />}
      {items && shared && view === 'month' && <MonthView anchor={anchor} {...shared} />}

      {items && slots.length === 0 && <EmptyState title="Очередь пуста" hint="В плане нет изделий для прогноза" />}

      {editing && cfg && (
        <DaySettingsDialog
          date={editing}
          label={dayLabel(editing)}
          info={dayInfo(editing, cfg)}
          draft={drafts[editing]}
          cfg={cfg}
          onOk={(d) => saveDraft(editing, d)}
          onCancel={() => setEditing(null)}
        />
      )}

      {move && preview && (
        <MoveConfirmDialog vin={move.vin} preview={preview} busy={moving} error={moveError} onConfirm={() => void confirmMove()} onCancel={() => setMove(null)} />
      )}

      {opened && <AssemblyProgress slot={opened} posts={cfg?.controlPosts ?? []} onClose={() => setOpened(null)} />}
    </div>
  );
}
