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

export type PhotoSide = 'left' | 'right';

export type TemplateConfig = {
  id: string;
  /** Barber slug this template belongs to. */
  barberSlug: string;
  /** SVG background asset (fixed brand design), relative to assets/. */
  backgroundAsset: string;
  /** Original brand logo asset — NEVER generated/redrawn, only placed/scaled. */
  logoAsset: string;
  /** Which side the barber stands on in the photo; slots go on the opposite side. */
  photoSide: PhotoSide;
  /**
   * When true the photo already contains the full brand composition (background,
   * logo, "СВОБОДНЫЕ СЛОТЫ / БАРБЕР {ИМЯ}" heading). The renderer then overlays
   * ONLY the slot column and the booking button — it does not redraw the logo or
   * heading. Requires the composed photo to be present.
   */
  prebaked?: boolean;
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

// Booking button placed on the SLOTS side (opposite the barber), below the
// slot column. The visible button and the Telegram tap link-area share these.
const CTA_LEFT: RelativeArea = { x: 0.3, y: 0.82, width: 0.44, height: 0.062 };
const CTA_RIGHT: RelativeArea = { x: 0.7, y: 0.82, width: 0.44, height: 0.062 };

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
    backgroundAsset: 'photos/artash.jpg',
    logoAsset: 'logo/rubl_logo.png',
    photoSide: 'left', // barber left → slots + button on the right
    prebaked: true,
    ctaArea: CTA_RIGHT,
    slotsSafeArea: SHARED_SLOTS_SAFE_AREA,
  },
  ksenia: {
    id: 'ksenia',
    barberSlug: 'ksenia',
    backgroundAsset: 'photos/ksenia.jpg',
    logoAsset: 'logo/rubl_logo.png',
    photoSide: 'right', // barber right → slots + button on the left
    prebaked: true,
    ctaArea: CTA_LEFT,
    slotsSafeArea: SHARED_SLOTS_SAFE_AREA,
  },
  dmitriy: {
    id: 'dmitriy',
    barberSlug: 'dmitriy',
    backgroundAsset: 'photos/dmitriy.jpg',
    logoAsset: 'logo/rubl_logo.png',
    photoSide: 'left', // barber left → slots + button on the right
    prebaked: true,
    ctaArea: CTA_RIGHT,
    slotsSafeArea: SHARED_SLOTS_SAFE_AREA,
  },
};

/** Fixed brand copy — never algorithmically rewritten. */
export const STORY_COPY = {
  headline: 'СВОБОДНЫЕ СЛОТЫ',
  /** Rendered as "БАРБЕР {NAME}". */
  subtitlePrefix: 'БАРБЕР',
  /** Booking call-to-action — used for the Telegram tap link-area. */
  cta: 'ЗАПИСАТЬСЯ →',
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
