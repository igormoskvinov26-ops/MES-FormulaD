import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initQueue, isQueueCollapsed, setQueueCollapsed } from './queuePref';

function setWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: px });
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-queue');
});
afterEach(() => setWidth(1024));

describe('queuePref', () => {
  it('на узком экране очередь свёрнута сама, на широком — нет', () => {
    setWidth(900);
    initQueue();
    expect(isQueueCollapsed()).toBe(true);
    setWidth(1440);
    window.dispatchEvent(new Event('resize'));
    expect(isQueueCollapsed()).toBe(false);
  });

  it('выбор оператора запоминается под своим ключом и важнее ширины', () => {
    setWidth(1440);
    initQueue();
    setQueueCollapsed(true);
    expect(document.documentElement.getAttribute('data-queue')).toBe('collapsed');
    expect(localStorage.getItem('f7-queue')).toBe('collapsed');
    expect(localStorage.getItem('f7-sidebar')).toBeNull();

    setWidth(800);
    setQueueCollapsed(false);
    window.dispatchEvent(new Event('resize'));
    expect(isQueueCollapsed()).toBe(false);
  });
});
