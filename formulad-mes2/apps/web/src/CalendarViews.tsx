import { useState } from 'react';
import { atvImageFor } from './atvVariant';
import { WEEKDAYS_SHORT, dayHourRows, dayInfo, isoWeekday, monthGrid, parseYmd, weekColumns, type CalendarConfig, type DayColumn, type Slot } from './calendar';
import type { DayDraft } from './DaySettingsDialog';

export type Dnd = {
  dragVin: string | null;
  over: string | null;
  isMovable: (slot: Slot) => boolean;
  onDragStart: (vin: string) => void;
  onDragEnd: () => void;
  onOver: (key: string) => void;
  onDropBefore: (slot: Slot) => void;
  onDropAt: (date: string, minute: number) => void;
  onKeyMove: (slot: Slot, dir: -1 | 1) => void;
  onMoveTo: (slot: Slot, where: 'first' | 'last') => void;
};

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS_NOMINATIVE = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

export const dayLabel = (date: string) => {
  const d = parseYmd(date);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
const weekdayOf = (date: string) => WEEKDAYS_SHORT[isoWeekday(date) - 1];

export type ViewProps = {
  cfg: CalendarConfig;
  slots: Slot[];
  today: string;
  drafts: Record<string, DayDraft>;
  onEditDay: (date: string) => void;
  onOpenDay: (date: string) => void;
  onOpenItem: (slot: Slot) => void;
  dnd: Dnd;
};

function deltaBadge(delta: number | null) {
  if (delta === null) return null;
  if (delta === 0) return <span className="cal__delta" data-tone="ok" title="Прогноз совпадает с плановой датой завершения">в срок</span>;
  return (
    <span className="cal__delta" data-tone={delta > 0 ? 'late' : 'early'} title={`Прогноз ${delta > 0 ? 'позже' : 'раньше'} плановой даты завершения на ${Math.abs(delta)} дн.`}>
      {delta > 0 ? `+${delta} дн` : `−${Math.abs(delta)} дн`}
    </span>
  );
}

export function Card({ slot, onOpen, wide, dnd }: { slot: Slot; onOpen: (slot: Slot) => void; wide?: boolean; dnd: Dnd }) {
  const { item } = slot;
  const image = atvImageFor(item);
  const movable = dnd.isMovable(slot);
  const [menu, setMenu] = useState(false);
  const act = (fn: () => void) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setMenu(false);
    fn();
  };
  return (
    <article
      className="cal__card"
      data-pinned={slot.pinned ? 'true' : undefined}
      data-done={slot.done ? 'true' : undefined}
      data-wide={wide ? 'true' : undefined}
      data-movable={movable ? 'true' : undefined}
      data-dragging={dnd.dragVin === item.vin ? 'true' : undefined}
      data-over={dnd.over === `card:${item.vin}` ? 'true' : undefined}
      tabIndex={0}
      draggable={movable}
      aria-label={`Изделие ${item.vin}, ${slot.time}`}
      title={movable ? 'Клик — прогресс сборки; перетащите, чтобы изменить порядок (Alt+↑/↓ — с клавиатуры)' : slot.done ? 'Клик — прогресс сборки. Изделие выпущено (ФОК пройден)' : 'Клик — прогресс сборки. Изделие уже в работе: в календаре закреплено'}
      onClick={() => onOpen(slot)}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', item.vin);
        e.dataTransfer.effectAllowed = 'move';
        dnd.onDragStart(item.vin);
      }}
      onDragEnd={dnd.onDragEnd}
      onDragOver={(e) => {
        if (!dnd.dragVin || dnd.dragVin === item.vin) return;
        e.preventDefault();
        e.stopPropagation();
        dnd.onOver(`card:${item.vin}`);
      }}
      onDrop={(e) => {
        if (!dnd.dragVin) return;
        e.preventDefault();
        e.stopPropagation();
        dnd.onDropBefore(slot);
      }}
      onKeyDown={(e) => {
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          if (movable) dnd.onKeyMove(slot, e.key === 'ArrowUp' ? -1 : 1);
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(slot);
        }
      }}
    >
      <div className="cal__card-top">
        <time className="cal__time">{slot.time}</time>
        {slot.done ? <span className="cal__pin" title="Изделие выпущено: фактическая дата ФОК">выпущено</span> : slot.pinned && <span className="cal__pin" title="Изделие уже в работе: в календаре закреплено">закреплено</span>}
        {deltaBadge(slot.deltaDays)}
        {movable && (
          <span className="cal__menu" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setMenu(false)}>
            <button type="button" className="cal__menu-btn" aria-label={`Действия с изделием ${item.vin}`} aria-expanded={menu} title="Переместить в очереди" onClick={(e) => { e.stopPropagation(); setMenu(!menu); }} onKeyDown={(e) => e.key === 'Escape' && setMenu(false)}>⋮</button>
            {menu && (
              <ul className="cal__menu-list" role="menu" aria-label={`Переместить ${item.vin}`}>
                <li role="none"><button type="button" role="menuitem" onClick={act(() => dnd.onMoveTo(slot, 'first'))}>В начало очереди</button></li>
                <li role="none"><button type="button" role="menuitem" onClick={act(() => dnd.onKeyMove(slot, -1))}>На место выше</button></li>
                <li role="none"><button type="button" role="menuitem" onClick={act(() => dnd.onKeyMove(slot, 1))}>На место ниже</button></li>
                <li role="none"><button type="button" role="menuitem" onClick={act(() => dnd.onMoveTo(slot, 'last'))}>В конец очереди</button></li>
              </ul>
            )}
          </span>
        )}
      </div>
      <strong className="mono cal__vin">{item.vin}</strong>
      <span className="cal__model">{item.modelName ?? item.modelArticle ?? '—'}</span>
      <span className="cal__color">{item.color ?? '—'}</span>
      {image && <img className="cal__atv" src={image} alt="" draggable={false} />}
    </article>
  );
}

const draftLabel = (d: DayDraft) => (d.kind === null ? 'стандартный график' : d.kind === 'off' ? 'выходной' : d.from ? `${d.from}–${d.to}` : 'рабочий день');

function DayHead({ day, draft, onEdit, onOpenDay }: { day: DayColumn; draft: DayDraft | undefined; onEdit: () => void; onOpenDay?: () => void }) {
  const note = day.override?.note ? ` · ${day.override.note}` : '';
  const label = dayLabel(day.date);
  return (
    <header className="cal__day-head">
      {onOpenDay ? (
        <button type="button" className="cal__day-link" aria-label={`Открыть день ${label}`} onClick={onOpenDay}>
          <span className="cal__weekday">{weekdayOf(day.date)}</span>
          <span className="cal__date">{label}</span>
        </button>
      ) : (
        <span className="cal__day-link">
          <span className="cal__weekday">{weekdayOf(day.date)}</span>
          <span className="cal__date">{label}</span>
        </span>
      )}
      <button type="button" className="ghost icon-btn cal__gear" aria-label={`Настроить день ${label}`} title="Настроить день: выходной, праздник, часы работы" onClick={onEdit}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="10" cy="10" r="2.6" />
          <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
        </svg>
      </button>
      {day.working ? (
        <>
          <span className="cal__hours-line">{day.from}–{day.to}{note}</span>
          <span className="cal__load" title="Изделий в прогнозе / вместимость дня">
            {day.slots.length} из {day.capacity}
            <span className="cal__load-bar" aria-hidden="true">
              <i style={{ width: `${day.capacity ? Math.min(100, (day.slots.length / day.capacity) * 100) : 0}%` }} />
            </span>
          </span>
        </>
      ) : (
        <span className="cal__off">выходной{note}</span>
      )}
      {draft && <span className="cal__draft">изменено → {draftLabel(draft)}</span>}
    </header>
  );
}

const columnOf = (date: string, slots: Slot[], cfg: CalendarConfig): DayColumn => ({ ...dayInfo(date, cfg), slots: slots.filter((s) => s.date === date) });

export function WeekView({ anchor, cfg, slots, today, drafts, onEditDay, onOpenDay, onOpenItem, dnd }: ViewProps & { anchor: string }) {
  return (
    <main className="cal__week" aria-label="Неделя">
      {weekColumns(anchor, slots, cfg).map((day) => (
        <section key={day.date} className="cal__day" data-working={String(day.working)} data-today={day.date === today ? 'true' : undefined} data-draft={drafts[day.date] ? 'true' : undefined} aria-label={`${weekdayOf(day.date)} ${dayLabel(day.date)}`}>
          <DayHead day={day} draft={drafts[day.date]} onEdit={() => onEditDay(day.date)} onOpenDay={() => onOpenDay(day.date)} />
          <div
            className="cal__cards"
            data-over={dnd.over === `day:${day.date}` ? 'true' : undefined}
            onDragOver={(e) => {
              if (!dnd.dragVin) return;
              e.preventDefault();
              dnd.onOver(`day:${day.date}`);
            }}
            onDrop={(e) => {
              if (!dnd.dragVin) return;
              e.preventDefault();
              dnd.onDropAt(day.date, 24 * 60);
            }}
          >
            {day.slots.map((s) => <Card key={s.item.vin} slot={s} onOpen={onOpenItem} dnd={dnd} />)}
            {day.working && day.slots.length === 0 && <span className="cal__empty">нет изделий</span>}
          </div>
        </section>
      ))}
    </main>
  );
}

export function DayView({ anchor, cfg, slots, today, drafts, onEditDay, onOpenItem, dnd }: ViewProps & { anchor: string }) {
  const day = columnOf(anchor, slots, cfg);
  const rows = dayHourRows(day, day.slots, cfg);
  return (
    <main className="cal__dayview" aria-label="День">
      <section className="cal__day" data-working={String(day.working)} data-today={anchor === today ? 'true' : undefined} data-draft={drafts[anchor] ? 'true' : undefined} aria-label={`${weekdayOf(anchor)} ${dayLabel(anchor)}`}>
        <DayHead day={day} draft={drafts[anchor]} onEdit={() => onEditDay(anchor)} />
        {!day.working ? (
          <p className="cal__empty cal__empty--big">Выходной день. Кнопка ⦿ в шапке дня делает его рабочим или меняет часы работы.</p>
        ) : (
          <>
          <ol className="cal__hourlist" aria-label="Часы дня">
            {rows.map((row) => (
              <li key={row.hour} className="cal__hour" data-break={row.isBreak ? 'true' : undefined} aria-label={row.isBreak ? `${row.label} — перерыв` : row.label}>
                <time className="cal__hour-label">{row.label}</time>
                <div
                  className="cal__hour-cards"
                  data-over={dnd.over === `hour:${row.hour}` ? 'true' : undefined}
                  onDragOver={(e) => {
                    if (!dnd.dragVin) return;
                    e.preventDefault();
                    dnd.onOver(`hour:${row.hour}`);
                  }}
                  onDrop={(e) => {
                    if (!dnd.dragVin) return;
                    e.preventDefault();
                    dnd.onDropAt(anchor, row.hour * 60);
                  }}
                >
                  {row.isBreak && row.slots.length === 0 && <span className="cal__break">перерыв</span>}
                  {row.slots.map((s) => <Card key={s.item.vin} slot={s} onOpen={onOpenItem} wide dnd={dnd} />)}
                </div>
              </li>
            ))}
          </ol>
          {day.slots.some((s) => !rows.some((r) => r.slots.includes(s))) && (
            <div className="cal__orphans" aria-label="Без времени или вне графика">
              <span className="cal__break">Без времени или вне графика</span>
              <div className="cal__hour-cards">
                {day.slots.filter((s) => !rows.some((r) => r.slots.includes(s))).map((s) => <Card key={s.item.vin} slot={s} onOpen={onOpenItem} wide dnd={dnd} />)}
              </div>
            </div>
          )}
          </>
        )}
      </section>
    </main>
  );
}

export function MonthView({ anchor, cfg, slots, today, drafts, onOpenDay }: ViewProps & { anchor: string }) {
  const month = parseYmd(anchor).getMonth();
  return (
    <main className="cal__month" aria-label="Месяц">
      {WEEKDAYS_SHORT.map((w) => <span key={w} className="cal__month-wd">{w}</span>)}
      {monthGrid(anchor).map((date) => {
        const day = columnOf(date, slots, cfg);
        const n = day.slots.length;
        const note = day.override?.note;
        return (
          <button
            key={date}
            type="button"
            className="cal__cell"
            data-working={String(day.working)}
            data-other={parseYmd(date).getMonth() !== month ? 'true' : undefined}
            data-today={date === today ? 'true' : undefined}
            data-draft={drafts[date] ? 'true' : undefined}
            data-over={day.working && n > day.capacity ? 'true' : undefined}
            aria-label={`${dayLabel(date)}: ${day.working ? `${n} из ${day.capacity}` : 'выходной'}`}
            onClick={() => onOpenDay(date)}
          >
            <span className="cal__cell-num">{parseYmd(date).getDate()}</span>
            {day.working ? (
              <>
                <span className="cal__cell-load">{n > 0 ? `${n} из ${day.capacity}` : ''}</span>
                <span className="cal__load-bar" aria-hidden="true"><i style={{ width: `${day.capacity ? Math.min(100, (n / day.capacity) * 100) : 0}%` }} /></span>
                {day.slots.slice(0, 3).map((s) => <span key={s.item.vin} className="cal__chip mono">{s.time} {s.item.vin.slice(-8)}</span>)}
                {n > 3 && <span className="cal__chip cal__chip--more">ещё {n - 3}</span>}
              </>
            ) : (
              <span className="cal__cell-off">выходной{note ? ` · ${note}` : ''}</span>
            )}
          </button>
        );
      })}
    </main>
  );
}
