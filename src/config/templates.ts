import { barberBySlug } from './barbers.js';

/**
 * Fixed Story templates. The visual composition is FIXED — the backend never
 * invents a new layout. Only dynamic data (available slots, and the date if
 * needed) changes between renders.
 *
 * Story canvas is always 1080 × 1920.
 */
export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

/**
 * Telegram Story link/media area is expressed in RELATIVE coordinates
 * (fractions of width/height, 0..1) because Telegram's story areas use a
 * normalized coordinate/percentage system. Absolute pixel helpers are derived
 * from these against the 1080×1920 canvas.
 */
export type RelativeArea = {
  x: number; // center X, 0..1
  y: number; // center Y, 0..1
  width: number; // 0..1
  height: number; // 0..1
};

export type TemplateConfig = {
  id: string;
  /** Barber slug this template belongs to. */
  barberSlug: string;
  /** SVG background asset (fixed brand design), relative to assets/. */
  backgroundAsset: string;
  /** Original brand logo asset — NEVER generated/redrawn, only placed/scaled. */
  logoAsset: string;
  /**
   * Clickable "ЗАПИСАТЬСЯ →" link area, as a normalized area over the CTA
   * pixels of the design. Stored in config, never hard-coded inside the
   * Telegram send function.
   */
  ctaArea: RelativeArea;
  /** Safe area (px) kept clear of face/logo/CTA when laying out slots. */
  slotsSafeArea: { top: number; bottom: number; left: number; right: number };
};

/**
 * The three fixed barber templates. Background/logo asset paths point at files
 * that a designer supplies (see assets/). The brand logo is referenced, never
 * generated.
 *
 * ctaArea is a first-pass value aligned to the shared composition below; adjust
 * per final artwork. It lives here so it can be tuned without touching code.
 */
const SHARED_CTA_AREA: RelativeArea = {
  // CTA band sits in the lower third, horizontally centered, above the
  // very bottom safe margin. Values are normalized to the 1080×1920 canvas.
  x: 0.5,
  y: 0.8,
  width: 0.62,
  height: 0.08,
};

const SHARED_SLOTS_SAFE_AREA = {
  top: 780, // below headline + face region
  bottom: 380, // above CTA + brand phrase
  left: 80,
  right: 80,
};

export const TEMPLATES: Record<string, TemplateConfig> = {
  artash: {
    id: 'artash',
    barberSlug: 'artash',
    backgroundAsset: 'templates/artash.svg',
    logoAsset: 'logo/rubl_logo.svg',
    ctaArea: SHARED_CTA_AREA,
    slotsSafeArea: SHARED_SLOTS_SAFE_AREA,
  },
  ksenia: {
    id: 'ksenia',
    barberSlug: 'ksenia',
    backgroundAsset: 'templates/ksenia.svg',
    logoAsset: 'logo/rubl_logo.svg',
    ctaArea: SHARED_CTA_AREA,
    slotsSafeArea: SHARED_SLOTS_SAFE_AREA,
  },
  dmitriy: {
    id: 'dmitriy',
    barberSlug: 'dmitriy',
    backgroundAsset: 'templates/dmitriy.svg',
    logoAsset: 'logo/rubl_logo.svg',
    ctaArea: SHARED_CTA_AREA,
    slotsSafeArea: SHARED_SLOTS_SAFE_AREA,
  },
};

/** Fixed brand copy — never algorithmically rewritten. */
export const STORY_COPY = {
  headline: 'В РУБЛЪ ТЕБЯ СЕГОДНЯ ЖДУТ',
  cta: 'ЗАПИСАТЬСЯ →',
  brandPhrase: 'НАМ ДОВЕРЯЮТ СВОИ ГОЛОВЫ',
} as const;

export function templateFor(slug: string): TemplateConfig | undefined {
  return TEMPLATES[slug];
}

/** Resolve a template via a barber slug, verifying the barber exists. */
export function templateForBarber(slug: string): TemplateConfig | undefined {
  if (!barberBySlug(slug)) return undefined;
  return templateFor(slug);
}

/** Convert a normalized area to absolute pixels on the 1080×1920 canvas. */
export function areaToPixels(a: RelativeArea) {
  return {
    x: Math.round(a.x * STORY_WIDTH),
    y: Math.round(a.y * STORY_HEIGHT),
    width: Math.round(a.width * STORY_WIDTH),
    height: Math.round(a.height * STORY_HEIGHT),
  };
}
