import { createCollapsePref } from './collapsePref';

/** Боковое меню: свёрнуто до значков или развёрнуто (на экране уже 1100 px — свёрнуто само, пока нет выбора оператора). */
export const NARROW_PX = 1100;

const pref = createCollapsePref({ key: 'f7-sidebar', attr: 'data-sidebar', event: 'f7-sidebar-change', narrowPx: NARROW_PX });

export const isSidebarCollapsed = pref.isCollapsed;
export const initSidebar = pref.init;
export const setSidebarCollapsed = pref.set;
export const subscribeSidebar = pref.subscribe;
