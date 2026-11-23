import { describe, expect, it } from 'vitest';
import { COLUMNS, DEFAULT_VISIBLE } from './columns';

describe('columns', () => {
  it('нет дубликатов ключей', () => {
    const keys = COLUMNS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('все видимые по умолчанию колонки существуют в COLUMNS', () => {
    const keys = new Set(COLUMNS.map((c) => c.key));
    for (const k of DEFAULT_VISIBLE) expect(keys.has(k)).toBe(true);
  });
});
