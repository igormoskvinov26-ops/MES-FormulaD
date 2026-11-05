import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultFlash, isSoundOn, setSoundOn, useResultSignal } from './resultSignal';

function Probe({ message }: { message: { kind: 'ok' | 'error'; text: string } | null }) {
  const signal = useResultSignal(message);
  return <ResultFlash signal={signal} />;
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('вспышка результата', () => {
  it('показывается для итога операции, скрыта от скринридеров и исчезает сама', () => {
    const { container, rerender } = render(<Probe message={null} />);
    expect(container.querySelector('.result-flash')).toBeNull();

    rerender(<Probe message={{ kind: 'error', text: 'VIN не найден' }} />);
    const flash = container.querySelector('.result-flash');
    expect(flash).toHaveAttribute('data-kind', 'error');
    expect(flash).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.result-flash__card')).toHaveAttribute('data-text', 'VIN не найден');
    expect(container.textContent).toBe('');

    act(() => { vi.advanceTimersByTime(2000); });
    expect(container.querySelector('.result-flash')).toBeNull();
  });

  it('звук по умолчанию включён и переключается', () => {
    expect(isSoundOn()).toBe(true);
    setSoundOn(false);
    expect(isSoundOn()).toBe(false);
  });
});
