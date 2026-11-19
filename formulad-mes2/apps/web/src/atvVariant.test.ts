import { describe, expect, it } from 'vitest';
import { atvImageFor } from './atvVariant';

describe('atvImageFor', () => {
  it('подбирает картинку по модели и цвету', () => {
    expect(atvImageFor({ modelArticle: 'DEMO-1000', color: 'Чёрный' })).toBe('/atv/touring-black.webp');
    expect(atvImageFor({ modelArticle: 'DEMO-700', color: 'Оливковый шторм' })).toBe('/atv/utility-green.webp');
    expect(atvImageFor({ modelArticle: 'DEMO-800', color: 'Камуфляж' })).toBe('/atv/sport-camo.webp');
  });
  it('нет картинки для сочетания, которого не нарисовано, и для неизвестного', () => {
    expect(atvImageFor({ modelArticle: 'DEMO-700', color: 'Жёлтый лимон' })).toBeNull();
    expect(atvImageFor({ modelArticle: 'XYZ', color: 'Красный' })).toBeNull();
    expect(atvImageFor(null)).toBeNull();
  });
});
