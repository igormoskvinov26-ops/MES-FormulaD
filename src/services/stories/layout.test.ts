import { describe, expect, it } from 'vitest';
import { MAX_VISIBLE_SLOTS, planSlotLayout } from './layout.js';

describe('slot layout (spec §9)', () => {
  it('1 slot → single large value', () => {
    const l = planSlotLayout(['13:30']);
    expect(l.columns).toBe(1);
    expect(l.visible).toEqual(['13:30']);
    expect(l.fontSizePx).toBeGreaterThanOrEqual(140);
    expect(l.hiddenCount).toBe(0);
  });

  it('2 slots → two large values, single column', () => {
    const l = planSlotLayout(['13:30', '16:00']);
    expect(l.columns).toBe(1);
    expect(l.visible.length).toBe(2);
  });

  it('3 slots → three values', () => {
    const l = planSlotLayout(['11:30', '13:30', '16:00']);
    expect(l.columns).toBe(1);
    expect(l.visible.length).toBe(3);
  });

  it('4–5 slots → compact 2-column grid', () => {
    const l = planSlotLayout(['10:00', '11:30', '13:30', '16:00', '18:30']);
    expect(l.columns).toBe(2);
    expect(l.visible.length).toBe(5);
  });

  it('6+ slots → 3-column compact layout, smaller font', () => {
    const l = planSlotLayout(['10:00', '11:00', '12:00', '13:00', '14:00', '15:00']);
    expect(l.columns).toBe(3);
    expect(l.fontSizePx).toBeLessThan(90);
  });

  it('too many slots → shows nearest MAX_VISIBLE_SLOTS and reports hidden count', () => {
    const many = Array.from({ length: 14 }, (_, i) => `${String(8 + i).padStart(2, '0')}:00`);
    const l = planSlotLayout(many);
    expect(l.visible.length).toBe(MAX_VISIBLE_SLOTS);
    expect(l.hiddenCount).toBe(14 - MAX_VISIBLE_SLOTS);
    // nearest (earliest) slots kept
    expect(l.visible[0]).toBe('08:00');
  });

  it('0 slots → nothing visible', () => {
    const l = planSlotLayout([]);
    expect(l.visible.length).toBe(0);
    expect(l.hiddenCount).toBe(0);
  });
});
