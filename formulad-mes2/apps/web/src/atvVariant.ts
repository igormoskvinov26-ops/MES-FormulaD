export type AtvType = 'utility' | 'sport' | 'touring';
export type AtvTone = 'red' | 'green' | 'blue' | 'yellow' | 'camo' | 'white' | 'black';

export const ATV_IMAGES: Record<AtvType, AtvTone[]> = {
  utility: ['red', 'green', 'blue'],
  sport: ['red', 'yellow', 'camo'],
  touring: ['white', 'blue', 'black'],
};

const TYPE_BY_MODEL: [RegExp, AtvType][] = [
  [/700/, 'utility'],
  [/800/, 'sport'],
  [/1000/, 'touring'],
];

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

export function atvImageFor(item: { modelArticle?: string | null; modelName?: string | null; color?: string | null } | null): string | null {
  if (!item) return null;
  const type = atvTypeOf(item.modelArticle) ?? atvTypeOf(item.modelName);
  const tone = atvToneOf(item.color);
  if (!type || !tone || !ATV_IMAGES[type].includes(tone)) return null;
  return `/atv/${type}-${tone}.webp`;
}
