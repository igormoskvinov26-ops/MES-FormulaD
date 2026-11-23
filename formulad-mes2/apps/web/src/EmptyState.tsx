/**
 * Пустое состояние: линейный контур квадроцикла + заголовок + подсказка, что делать дальше.
 * Заголовок — тот же текст, что был до оформления (на него опираются тесты и скринридеры).
 */
export function EmptyState({ title, hint, compact = false }: { title: string; hint?: string; compact?: boolean }) {
  return (
    <div className={compact ? 'empty empty--compact' : 'empty'}>
      <svg viewBox="0 0 160 84" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="38" cy="60" r="17" />
        <circle cx="38" cy="60" r="7" />
        <circle cx="124" cy="60" r="17" />
        <circle cx="124" cy="60" r="7" />
        <path d="M38 43 L46 30 L72 24 L98 24 L112 33 L132 40 L141 46" />
        <path d="M54 29 L60 18 L96 16 L100 24" />
        <path d="M112 33 L118 16 L132 11" />
        <path d="M70 45 L106 45 M82 45 L86 36 L102 36" />
      </svg>
      <p className="empty__title">{title}</p>
      {hint && <small className="empty__hint">{hint}</small>}
    </div>
  );
}
