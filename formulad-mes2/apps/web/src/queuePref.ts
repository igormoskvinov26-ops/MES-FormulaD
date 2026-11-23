import { createCollapsePref } from './collapsePref';

/** Очередь на экранах скана: рейка со счётчиком или полный список (на экране уже 1100 px — рейка, пока нет выбора оператора). */
const pref = createCollapsePref({ key: 'f7-queue', attr: 'data-queue', event: 'f7-queue-change', narrowPx: 1100 });

export const isQueueCollapsed = pref.isCollapsed;
export const initQueue = pref.init;
export const setQueueCollapsed = pref.set;
export const subscribeQueue = pref.subscribe;
