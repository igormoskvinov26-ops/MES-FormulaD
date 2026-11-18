/**
 * Какая картинка квадроцикла показывается для изделия: тип по модели + цвет → готовый PNG из `public/atv/`.
 * ВНИМАНИЕ: таблицы ниже — рабочие допущения по демо-данным; реальное соответствие моделей типам и цветов вариантам
 * должно подтвердить производство (см. docs/handbook/19-UX-REVIEW-NOTES.md). Нет точного совпадения → null
 * (показывается нейтральная картинка), а не «ближайший» цвет, чтобы не вводить в заблуждение.
 */
export type AtvType = 'utility' | 'sport' | 'touring';
export type AtvTone = 'red' | 'green' | 'blue' | 'yellow' | 'camo' | 'white' | 'black';

/** Какие цвета нарисованы для каждого типа. */
export const ATV_IMAGES: Record<AtvType, AtvTone[]> = {
  utility: ['red', 'green', 'blue'],
  sport: ['red', 'yellow', 'camo'],
  touring: ['white', 'blue', 'black'],
};

/** Допущение: артикул модели → тип (демо: 700 — утилитарный, 800 — спортивный, 1000 — туринг). */
const TYPE_BY_MODEL: [RegExp, AtvType][] = [
  [/700/, 'utility'],
  [/800/, 'sport'],
  [/1000/, 'touring'],
];

/** Название цвета из справочника → тон картинки (по ключевым словам). */
const TONE_BY_COLOR: [RegExp, AtvTone][] = [
  [/камуфляж/i, 'camo'],
  [/фиолетово-чёрн|чёрн|черн/i, 'black'],
  [/жёлт|желт/i, 'yellow'],
  [/зелён|зелен|оливк/i, 'green'],
  [/син|голуб/i, 'blue'],
  [/красн|огненн/i, 'red'],
  [/бел|сер/i, 'white'],
];

export function atvTypeOf(model: string | null | undefined): AtvType | null {
  if (!model) return null;
  return TYPE_BY_MODEL.find(([re]) => re.test(model))?.[1] ?? null;
}

export function atvToneOf(color: string | null | undefined): AtvTone | null {
  if (!color) return null;
  return TONE_BY_COLOR.find(([re]) => re.test(color))?.[1] ?? null;
}

/** Путь к картинке или null, если для сочетания модели и цвета её нет. */
export function atvImageFor(item: { modelArticle?: string | null; modelName?: string | null; color?: string | null } | null): string | null {
  if (!item) return null;
  const type = atvTypeOf(item.modelArticle) ?? atvTypeOf(item.modelName);
  const tone = atvToneOf(item.color);
  if (!type || !tone || !ATV_IMAGES[type].includes(tone)) return null;
  return `/atv/${type}-${tone}.webp`;
}
