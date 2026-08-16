/**
 * Slot layout logic. The Story must read well for any reasonable slot count
 * (spec §9):
 *   1 slot   → one large value
 *   2 slots  → two large values
 *   3 slots  → three values
 *   4–5      → compact grid
 *   6+       → multi-row compact layout
 *
 * If there are too many slots, show the most useful nearest set (still truthful).
 */
export const MAX_VISIBLE_SLOTS = 9;

export type SlotLayout = {
  columns: number;
  fontSizePx: number;
  gapPx: number;
  visible: string[];
  hiddenCount: number;
};

export function planSlotLayout(slotsSorted: string[]): SlotLayout {
  const total = slotsSorted.length;
  const visible = slotsSorted.slice(0, MAX_VISIBLE_SLOTS);
  const hiddenCount = Math.max(0, total - visible.length);
  const n = visible.length;

  let columns: number;
  let fontSizePx: number;
  let gapPx: number;

  if (n <= 1) {
    columns = 1;
    fontSizePx = 150;
    gapPx = 0;
  } else if (n === 2) {
    columns = 1;
    fontSizePx = 128;
    gapPx = 40;
  } else if (n === 3) {
    columns = 1;
    fontSizePx = 104;
    gapPx = 32;
  } else if (n <= 5) {
    columns = 2;
    fontSizePx = 84;
    gapPx = 28;
  } else {
    columns = 3;
    fontSizePx = 66;
    gapPx = 22;
  }

  return { columns, fontSizePx, gapPx, visible, hiddenCount };
}
