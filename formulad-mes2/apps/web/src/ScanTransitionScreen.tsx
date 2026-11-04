import { useCallback, useEffect, useRef, useState } from 'react';
import type { Screen } from './AppHeader';
import { AppHeader } from './AppHeader';
import { ApiError, api, type ProductionPlanItem } from './api';
import { dash, statusCodeLabel } from './format';
import { EmptyState } from './EmptyState';
import { isQueueCollapsed, setQueueCollapsed, subscribeQueue } from './queuePref';
import { ResultFlash, useResultSignal } from './resultSignal';
import './f7-components.css';

/**
 * Общая механика перехода по сканеру (раздел 9 спецификации): первое сканирование ищет
 * изделие среди допустимого статуса, второе сканирование того же VIN (или кнопка)
 * подтверждает переход. Один компонент — используют экраны Старт (Этап 3), а дальше
 * Завершение и FOK (Этап 4) и Rework (Этап 6), не копируя механику заново.
 */
export function ScanTransitionScreen({
  screen,
  session,
  onNavigate,
  onLogout,
  title,
  eligibleStatusId,
  afterStatusId,
  confirmLabel,
  listTitle,
  onConfirm,
  extraCheck,
  extraContent,
  secondaryActionLabel,
  secondaryAfterStatusId,
  onSecondaryAction,
}: {
  screen: Screen;
  session: { userName: string | null; mode: string };
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
  title: string;
  /** Изделие учитывается только в этом статусе — раздел 9/10: ошибочный статус не проходит переход. */
  eligibleStatusId: number;
  /** Статус, в который перейдёт изделие после подтверждения — только для текста сообщения. */
  afterStatusId: number;
  confirmLabel: string;
  listTitle: string;
  onConfirm: (vin: string) => Promise<ProductionPlanItem>;
  /**
   * Дополнительная проверка сверх статуса — например, FOK проверяет незакрытую обязательную
   * деталь (раздел 16). Возвращает причину блокировки или null, если можно подтверждать.
   * Проверяется на этапе поиска, чтобы отказ был виден ДО попытки подтверждения (раздел 18, [П]).
   */
  extraCheck?: (item: ProductionPlanItem) => Promise<string | null>;
  /**
   * Произвольный блок внутри карточки найденного изделия — например, Rework показывает здесь
   * список открытых NCP с действиями прямо в этом окне (раздел 17, [С]). `refresh` заново
   * прогоняет поиск/extraCheck для того же VIN — нужно вызвать после изменения NCP, чтобы кнопка
   * подтверждения обновилась без повторного скана.
   */
  extraContent?: (item: ProductionPlanItem, refresh: () => void) => React.ReactNode;
  /**
   * Альтернативное действие, доступное ТОЛЬКО когда статус подошёл, но extraCheck заблокировал
   * переход — например, «Отправить в Rework» на экране FOK (раздел 225: изделие с незакрытой
   * проблемой не должно теряться). Не показывается при простом несовпадении статуса.
   */
  secondaryActionLabel?: string;
  secondaryAfterStatusId?: number;
  onSecondaryAction?: (vin: string) => Promise<ProductionPlanItem>;
}) {
  const [input, setInput] = useState('');
  const [found, setFound] = useState<ProductionPlanItem | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [blockedByCheck, setBlockedByCheck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ProductionPlanItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultSignal = useResultSignal(message);
  const [queueCollapsed, setQueueCollapsedState] = useState(isQueueCollapsed);
  const listRef = useRef<HTMLUListElement>(null);
  const inQueue = found !== null && pending.some((item) => item.vin === found.vin);
  const requestId = useRef(0);

  // Разрешено подтверждать только когда что-то найдено и ни одна проверка (статус, extraCheck)
  // не оставила сообщение об ошибке — единая точка истины вместо двух раздельных флагов.
  const eligible = found !== null && message === null;

  const reloadPending = useCallback(() => {
    api
      .plan({ statusId: eligibleStatusId, page: 1, pageSize: 25 })
      .then((page) => setPending(page.items))
      .catch(() => setPending([]));
  }, [eligibleStatusId]);

  useEffect(reloadPending, [reloadPending]);
  useEffect(() => subscribeQueue(() => setQueueCollapsedState(isQueueCollapsed())), []);

  // Выбранное изделие должно быть видно в длинной очереди.
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [found?.vin, pending]);

  // ponytail: autofocus on mount and after screen switch
  useEffect(() => { focusInput(); }, [screen]);

  function focusInput() {
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function lookup(vin: string) {
    const id = ++requestId.current;
    setBusy(true);
    try {
      const item = await api.byVin(vin);
      if (id !== requestId.current) return;
      setFound(item);

      if (item.statusId !== eligibleStatusId) {
        setBlockedByCheck(false);
        setMessage({
          kind: 'error',
          text: `Статус «${statusCodeLabel(item.statusId)}», ожидался «${statusCodeLabel(eligibleStatusId)}» — перевести нельзя.`,
        });
      } else {
        const blockReason = extraCheck ? await extraCheck(item) : null;
        if (id !== requestId.current) return;
        setBlockedByCheck(blockReason !== null);
        setMessage(blockReason ? { kind: 'error', text: blockReason } : null);
      }
    } catch (e) {
      if (id !== requestId.current) return;
      setFound(null);
      setBlockedByCheck(false);
      setMessage({
        kind: 'error',
        text: e instanceof ApiError && e.status === 404 ? `VIN ${vin} не найден` : 'Нет связи с сервером',
      });
    } finally {
      if (id === requestId.current) { setBusy(false); focusInput(); }
    }
  }

  async function confirm(vin: string) {
    setBusy(true);
    try {
      await onConfirm(vin);
      setFound(null);
      setMessage({ kind: 'ok', text: `Готово: ${vin} → «${statusCodeLabel(afterStatusId)}»` });
      reloadPending();
    } catch {
      // Между поиском и подтверждением кто-то мог изменить статус — переспрашиваем заново,
      // а не доверяем устаревшей карточке (раздел 28, п.5 спецификации: конфликт не должен
      // тихо потеряться).
      setFound(null);
      setMessage({ kind: 'error', text: 'Не удалось выполнить переход — отсканируйте VIN ещё раз' });
    } finally {
      setBusy(false);
      setInput('');
      focusInput();
    }
  }

  async function secondary(vin: string) {
    if (!onSecondaryAction) return;
    setBusy(true);
    try {
      const after = await onSecondaryAction(vin);
      setFound(null);
      setMessage({
        kind: 'ok',
        text: `Готово: ${vin} → «${statusCodeLabel(secondaryAfterStatusId ?? after.statusId)}»`,
      });
      reloadPending();
    } catch {
      setFound(null);
      setMessage({ kind: 'error', text: 'Не удалось выполнить переход — отсканируйте VIN ещё раз' });
    } finally {
      setBusy(false);
      setInput('');
      focusInput();
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (!value || busy) return;

    if (found && eligible && value.toLowerCase() === found.vin.toLowerCase()) {
      void confirm(found.vin);
    } else {
      void lookup(value);
      setInput('');
    }
  }

  return (
    <div className="app f7plan">
      <AppHeader screen={screen} onNavigate={onNavigate} session={session} onLogout={onLogout} />

      <ResultFlash signal={resultSignal} />

      <main className="scanx">
        <header className="scanx__title">
          <span className="f7mes__slash" aria-hidden="true" />
          <div>
            <h1>{title}</h1>
            <small>Повторный скан того же VIN или кнопка — подтверждение.</small>
          </div>
        </header>

        <div className="scanx__main">
          <form className="scanx__scan" onSubmit={onSubmit}>
            <span className="scanx__scan-symbol" aria-hidden="true">▥</span>
            <div className="scanx__scan-field">
              <span className="scanx__scan-label" aria-hidden="true">ОТСКАНИРУЙТЕ ИЛИ ВВЕДИТЕ VIN</span>
              <input
                ref={inputRef}
                aria-label="Сканирование VIN"
                placeholder="VIN / QR-код JobCard"
                value={input}
                maxLength={50}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                onChange={(event) => setInput(event.target.value)}
              />
            </div>
          </form>

          {message && (
            <p role="status" className={message.kind === 'ok' ? 'scan-banner scan-ok' : 'scan-banner scan-bad'}>
              <span aria-hidden="true">{message.kind === 'ok' ? '✓ ' : '⚠ '}</span>
              {message.text}
            </p>
          )}

          {found ? (
            <article
              className={`card scan-found${eligible ? '' : ' scan-found-blocked'}${extraContent ? ' scan-found--split' : ''}`}
              aria-label={`Найдено изделие ${found.vin}`}
            >
              <div className="scan-found__head">
                <h2 className="mono">{found.vin}</h2>
                <span className="scan-found__tag" data-ok={String(eligible)}>
                  {eligible ? 'Можно подтвердить' : 'Подтверждение недоступно'}
                </span>
              </div>
              <dl>
                <div>
                  <dt>Модель</dt>
                  <dd>{dash(found.modelName)}</dd>
                </div>
                <div>
                  <dt>Цвет</dt>
                  <dd>{dash(found.color)}</dd>
                </div>
                <div>
                  <dt>Текущий статус</dt>
                  <dd>{statusCodeLabel(found.statusId)}</dd>
                </div>
              </dl>

              {extraContent && <div className="scan-found__extra">{extraContent(found, () => void lookup(found.vin))}</div>}

              <div className="modal-actions scan-found__actions">
                <button type="button" onClick={() => { setFound(null); setMessage(null); focusInput(); }}>
                  Отмена
                </button>
                {blockedByCheck && onSecondaryAction && (
                  <button type="button" disabled={busy} onClick={() => void secondary(found.vin)}>
                    {secondaryActionLabel}
                  </button>
                )}
                <button
                  type="button"
                  className="primary"
                  disabled={!eligible || busy}
                  onClick={() => void confirm(found.vin)}
                >
                  {confirmLabel}
                </button>
              </div>
            </article>
          ) : (
            <div className="scanx__placeholder">
              <EmptyState title="Отсканируйте изделие, чтобы увидеть карточку" hint="Поле скана всегда активно — просто отсканируйте JobCard" />
            </div>
          )}
        </div>

        <aside className="scanx__queue" aria-label={`Очередь: ${listTitle}`} data-collapsed={String(queueCollapsed)}>
          <button
            type="button"
            className="scanx__queue-toggle"
            aria-expanded={!queueCollapsed}
            aria-label={queueCollapsed ? 'Развернуть очередь' : 'Свернуть очередь'}
            title={queueCollapsed ? 'Развернуть очередь' : 'Свернуть очередь'}
            onClick={() => setQueueCollapsed(!queueCollapsed)}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 2l5 5-5 5" />
            </svg>
          </button>

          <div className="scanx__queue-rail" aria-hidden="true">
            <b>{pending.length}</b>
            <span>ОЧЕРЕДЬ</span>
          </div>

          <div className="scanx__queue-body">
            <header className="scanx__queue-head">
              <h2 className="side-title">Очередь</h2>
              <b>{pending.length}</b>
              <small>{listTitle}</small>
            </header>
            {found && !inQueue && <p className="scanx__queue-note">Изделие не в очереди</p>}
            {pending.length === 0 ? (
              <EmptyState compact title="Список пуст" />
            ) : (
              <ul className="pending-list" ref={listRef}>
                {pending.map((item) => {
                  const selected = found?.vin === item.vin;
                  return (
                    <li key={item.vin}>
                      <button
                        type="button"
                        data-selected={String(selected)}
                        aria-current={selected ? 'true' : undefined}
                        onClick={() => { setInput(''); void lookup(item.vin); }}
                      >
                        <span className="mono">{item.vin}</span>
                        <span className="muted">{dash(item.modelName)}</span>
                        <span className="f7mes__queue-chevron" aria-hidden="true">›</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
