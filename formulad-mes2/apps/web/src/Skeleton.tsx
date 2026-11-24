/**
 * Скелетоны вместо надписи «Загрузка…»: форма будущего содержимого показывает, что именно грузится.
 * Для скринридера остаётся скрытая надпись «Загрузка…», контейнер помечен `aria-busy`.
 */
export function TableSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="skel" aria-busy="true">
      <span className="sr-only">Загрузка…</span>
      <div className="skel__head" aria-hidden="true" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skel__row" aria-hidden="true">
          <i /><i /><i /><i /><i /><i />
        </div>
      ))}
    </div>
  );
}

export function LinesSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skel skel--lines" aria-busy="true">
      <span className="sr-only">Загрузка…</span>
      {Array.from({ length: lines }, (_, i) => (
        <i key={i} className="skel__line" style={{ width: `${92 - i * 14}%` }} aria-hidden="true" />
      ))}
    </div>
  );
}

/** Первый запуск приложения (проверка сессии): знак F7 «дышит». */
export function BootScreen() {
  return (
    <div className="boot" aria-busy="true">
      <img src="/f7-mark.png" alt="" />
      <span className="sr-only">Загрузка…</span>
    </div>
  );
}
