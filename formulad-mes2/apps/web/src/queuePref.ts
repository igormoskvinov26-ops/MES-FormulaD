import { createCollapsePref } from './collapsePref';

const pref = createCollapsePref({ key: 'f7-queue', attr: 'data-queue', event: 'f7-queue-change', narrowPx: 1100 });

export const isQueueCollapsed = pref.isCollapsed;
export const initQueue = pref.init;
export const setQueueCollapsed = pref.set;
export const subscribeQueue = pref.subscribe;
