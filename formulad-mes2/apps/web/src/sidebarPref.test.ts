import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initSidebar, isSidebarCollapsed, setSidebarCollapsed } from './sidebarPref';

function setWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: px });
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-sidebar');
});
afterEach(() => setWidth(1024));

describe('sidebarPref', () => {
  it('на узком экране без выбора оператора меню свёрнуто, на широком — нет', () => {
    setWidth(900);
    initSidebar();
    expect(isSidebarCollapsed()).toBe(true);

    setWidth(1440);
    window.dispatchEvent(new Event('resize'));
    expect(isSidebarCollapsed()).toBe(false);
  });

  it('явный выбор оператора важнее ширины окна и запоминается', () => {
    setWidth(1440);
    initSidebar();
    setSidebarCollapsed(true);
    expect(isSidebarCollapsed()).toBe(true);
    expect(localStorage.getItem('f7-sidebar')).toBe('collapsed');

    setWidth(900);
    setSidebarCollapsed(false);
    window.dispatchEvent(new Event('resize'));
    expect(isSidebarCollapsed()).toBe(false);
  });

  it('при старте применяет сохранённое состояние даже на узком экране', () => {
    localStorage.setItem('f7-sidebar', 'expanded');
    setWidth(800);
    initSidebar();
    expect(isSidebarCollapsed()).toBe(false);
  });
});
