/**
 * Состояние бокового меню: свёрнуто до значков или развёрнуто.
 * Явный выбор оператора (localStorage `f7-sidebar`) всегда главнее; пока выбора нет, на узком экране
 * (планшет, < 1100 px) меню сворачивается само. Состояние живёт атрибутом `data-sidebar` на корне,
 * от него зависят ширина меню и отступ экранов (см. styles.css).
 */
const KEY = 'f7-sidebar';
export const NARROW_PX = 1100;
const EVENT = 'f7-sidebar-change';

function stored(): 'collapsed' | 'expanded' | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'collapsed' || v === 'expanded' ? v : null;
  } catch {
    return null;
  }
}

function apply(collapsed: boolean) {
  const root = document.documentElement;
  if (collapsed) root.setAttribute('data-sidebar', 'collapsed');
  else root.removeAttribute('data-sidebar');
  window.dispatchEvent(new Event(EVENT));
}

export function isSidebarCollapsed(): boolean {
  return document.documentElement.getAttribute('data-sidebar') === 'collapsed';
}

/** Вызывается один раз до первой отрисовки; следит за шириной окна, пока оператор сам не выбрал. */
export function initSidebar(): void {
  const sync = () => {
    const pref = stored();
    apply(pref ? pref === 'collapsed' : window.innerWidth < NARROW_PX);
  };
  sync();
  window.addEventListener('resize', () => {
    if (!stored()) sync();
  });
}

/** Явный выбор оператора: запоминается и перестаёт зависеть от ширины окна. */
export function setSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(KEY, collapsed ? 'collapsed' : 'expanded');
  } catch {
    /* без localStorage выбор действует до перезагрузки */
  }
  apply(collapsed);
}

export function subscribeSidebar(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
