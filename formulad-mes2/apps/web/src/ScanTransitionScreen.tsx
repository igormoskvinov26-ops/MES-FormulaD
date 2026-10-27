import { useCallback, useEffect, useRef, useState } from 'react';
import type { Screen } from './AppHeader';
import { AppHeader } from './AppHeader';
import { ApiError, api, type ProductionPlanItem } from './api';
import { dash, statusCodeLabel } from './format';

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
}) {
  const [input, setInput] = useState('');
  const [found, setFound] = useState<ProductionPlanItem | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ProductionPlanItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
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
        setMessage({
          kind: 'error',
          text: `Статус «${statusCodeLabel(item.statusId)}», ожидался «${statusCodeLabel(eligibleStatusId)}» — перевести нельзя.`,
        });
      } else {
        const blockReason = extraCheck ? await extraCheck(item) : null;
        if (id !== requestId.current) return;
        setMessage(blockReason ? { kind: 'error', text: blockReason } : null);
      }
    } catch (e) {
      if (id !== requestId.current) return;
      setFound(null);
      setMessage({
        kind: 'error',
        text: e instanceof ApiError && e.status === 404 ? `VIN ${vin} не найден` : 'Нет связи с сервером',
      });
    } finally {
      if (id === requestId.current) setBusy(false);
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
    <div className="app">
      <AppHeader screen={screen} onNavigate={onNavigate} session={session} onLogout={onLogout} />

      <section className="toolbar">
        <div>
          <h1>{title}</h1>
          <p className="muted">
            Отсканируйте JobCard или введите VIN. Повторное сканирование того же VIN или кнопка — подтверждение.
          </p>
        </div>
        <form className="controls" onSubmit={onSubmit}>
          <input
            ref={inputRef}
            className="search"
            aria-label="Сканирование VIN"
            placeholder="Отсканируйте или введите VIN"
            value={input}
            maxLength={50}
            autoFocus
            disabled={busy}
            onChange={(event) => setInput(event.target.value)}
          />
        </form>
      </section>

      <main className="content scan-content">
        <div className="scan-panel">
          {message && (
            <p role="status" className={message.kind === 'ok' ? 'scan-banner scan-ok' : 'scan-banner scan-bad'}>
              {message.text}
            </p>
          )}

          {found ? (
            <article className={eligible ? 'card scan-found' : 'card scan-found scan-found-blocked'} aria-label={`Найдено изделие ${found.vin}`}>
              <h2 className="mono">{found.vin}</h2>
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
              <div className="modal-actions">
                <button type="button" onClick={() => { setFound(null); setMessage(null); focusInput(); }}>
                  Отмена
                </button>
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
            <p className="muted center">Отсканируйте изделие, чтобы увидеть карточку</p>
          )}
        </div>

        <aside className="side">
          <h2 className="side-title">{listTitle}</h2>
          {pending.length === 0 ? (
            <p className="muted">Список пуст</p>
          ) : (
            <ul className="pending-list">
              {pending.map((item) => (
                <li key={item.vin}>
                  <button type="button" onClick={() => { setInput(''); void lookup(item.vin); }}>
                    <span className="mono">{item.vin}</span>
                    <span className="muted">{dash(item.modelName)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </main>
    </div>
  );
}
