import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  STORY_COPY,
  STORY_HEIGHT,
  STORY_WIDTH,
  areaToPixels,
} from '../../config/templates.js';
import { planSlotLayout } from './layout.js';
import type { StoryRenderData } from './html.js';

/**
 * Browser-free Story composition as an SVG string, rasterised by resvg. This is
 * the FIXED composition (spec §8) — only slot values (and optional date) change.
 * Deterministic: same inputs → same SVG → same PNG (spec §10).
 *
 * Background = the barber's own photo (assets/photos/<slug>.{jpg,jpeg,png}),
 * full-bleed, with a scrim so the logo/headline/slots/CTA stay legible. When no
 * photo is present yet, a dark gradient placeholder is used.
 */
const ASSETS_DIR = process.env.ASSETS_DIR || path.resolve(process.cwd(), 'assets');
export const FONT_DIR = path.join(ASSETS_DIR, 'fonts');
// Oswald (brand look) first; DejaVu Sans as fallback for glyphs Oswald lacks
// (e.g. the → arrow). resvg does per-glyph fallback across the provided files.
export const FONT_FILES = [
  path.join(FONT_DIR, 'Oswald-Bold.ttf'),
  path.join(FONT_DIR, 'Oswald-Medium.ttf'),
  path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'),
  path.join(FONT_DIR, 'DejaVuSans.ttf'),
];
export const DEFAULT_FONT_FAMILY = 'Oswald';
const FF = DEFAULT_FONT_FAMILY;

async function fileToDataUri(abs: string): Promise<string | null> {
  const ext = path.extname(abs).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : null;
  if (!mime) return null;
  try {
    const buf = await fs.readFile(abs);
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Resolve a barber photo by slug, trying common extensions. */
async function resolvePhoto(slug: string, explicit?: string): Promise<string | null> {
  const candidates = [
    explicit,
    `photos/${slug}.jpg`,
    `photos/${slug}.jpeg`,
    `photos/${slug}.png`,
  ].filter(Boolean) as string[];
  for (const rel of candidates) {
    const uri = await fileToDataUri(path.join(ASSETS_DIR, rel));
    if (uri) return uri;
  }
  return null;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Rough text width for Oswald (condensed) — used to size slot pills. */
function textWidth(s: string, fontSize: number): number {
  return s.length * fontSize * 0.5;
}

export async function buildStorySvg(data: StoryRenderData): Promise<string> {
  const { template } = data;
  const photo = await resolvePhoto(template.barberSlug, isRaster(template.backgroundAsset) ? template.backgroundAsset : undefined);
  const logo = await fileToDataUri(path.join(ASSETS_DIR, template.logoAsset));
  const hasPhoto = Boolean(photo);
  const layout = planSlotLayout(data.slots);
  const cta = areaToPixels(template.ctaArea);
  const safe = template.slotsSafeArea;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${STORY_WIDTH}" height="${STORY_HEIGHT}" viewBox="0 0 ${STORY_WIDTH} ${STORY_HEIGHT}">`,
  );

  // Scrim: darker top+bottom over a photo (legibility); soft dark for placeholder.
  const scrim = hasPhoto
    ? `<stop offset="0" stop-color="#000000" stop-opacity="0.66"/>
       <stop offset="0.30" stop-color="#000000" stop-opacity="0.12"/>
       <stop offset="0.50" stop-color="#000000" stop-opacity="0.22"/>
       <stop offset="1" stop-color="#000000" stop-opacity="0.85"/>`
    : `<stop offset="0" stop-color="#000000" stop-opacity="0.35"/>
       <stop offset="0.3" stop-color="#000000" stop-opacity="0"/>
       <stop offset="0.78" stop-color="#000000" stop-opacity="0.55"/>`;
  // Text outline so headline/date/brand stay legible over any photo.
  const outline = 'stroke="#000000" stroke-opacity="0.55" stroke-width="3" paint-order="stroke"';
  parts.push(`<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#171310"/><stop offset="0.55" stop-color="#0d0a08"/><stop offset="1" stop-color="#070605"/>
    </linearGradient>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">${scrim}</linearGradient>
  </defs>`);

  // Background: barber photo (full-bleed) or gradient placeholder.
  if (photo) {
    parts.push(
      `<image href="${photo}" x="0" y="0" width="${STORY_WIDTH}" height="${STORY_HEIGHT}" preserveAspectRatio="xMidYMid slice"/>`,
    );
  } else {
    parts.push(`<rect width="${STORY_WIDTH}" height="${STORY_HEIGHT}" fill="url(#bg)"/>`);
    parts.push(
      `<text x="540" y="700" fill="#2c261e" font-family="${FF}" font-size="30" text-anchor="middle" letter-spacing="4">ФОТО МАСТЕРА</text>`,
    );
  }
  parts.push(`<rect width="${STORY_WIDTH}" height="${STORY_HEIGHT}" fill="url(#scrim)"/>`);

  // Logo (original asset only scaled/positioned).
  if (logo) {
    parts.push(`<image href="${logo}" x="310" y="60" width="460" height="300" preserveAspectRatio="xMidYMid meet"/>`);
  } else {
    parts.push(
      `<rect x="390" y="120" width="300" height="110" rx="8" fill="none" stroke="#6b5f52" stroke-width="2"/>` +
        `<text x="540" y="192" fill="#6b5f52" font-family="${FF}" font-weight="700" font-size="38" text-anchor="middle" letter-spacing="6">LOGO</text>`,
    );
  }

  // Headline.
  parts.push(
    `<text x="540" y="424" fill="#f5f0e8" font-family="${FF}" font-weight="700" font-size="60" text-anchor="middle" letter-spacing="1" ${outline}>${esc(STORY_COPY.headline)}</text>`,
  );

  // Optional date.
  if (data.dateLabel) {
    parts.push(
      `<text x="540" y="500" fill="#e8c37a" font-family="${FF}" font-weight="500" font-size="34" text-anchor="middle" letter-spacing="4" ${outline}>${esc(data.dateLabel)}</text>`,
    );
  }

  // Slots grid within the safe area.
  parts.push(renderSlots(layout, safe, hasPhoto));

  // CTA pill.
  parts.push(
    `<rect x="${cta.x - cta.width / 2}" y="${cta.y - cta.height / 2}" width="${cta.width}" height="${cta.height}" rx="${cta.height / 2}" fill="#e8c37a"/>` +
      `<text x="${cta.x}" y="${cta.y + 19}" fill="#0a0908" font-family="${FF}" font-weight="700" font-size="54" text-anchor="middle" letter-spacing="1">${esc(STORY_COPY.cta)}</text>`,
  );

  // Brand phrase.
  parts.push(
    `<text x="540" y="1834" fill="#e6d6b3" font-family="${FF}" font-weight="500" font-size="32" text-anchor="middle" letter-spacing="5" ${outline}>${esc(STORY_COPY.brandPhrase)}</text>`,
  );

  parts.push('</svg>');
  return parts.join('\n');
}

function isRaster(rel: string): boolean {
  return ['.png', '.jpg', '.jpeg'].includes(path.extname(rel).toLowerCase());
}

function renderSlots(
  layout: ReturnType<typeof planSlotLayout>,
  safe: { top: number; bottom: number; left: number; right: number },
  hasPhoto: boolean,
): string {
  if (layout.visible.length === 0) {
    return `<text x="540" y="1000" fill="#f0e6d2" font-family="${FF}" font-weight="700" font-size="52" text-anchor="middle">Скоро новые окна</text>`;
  }
  const cols = layout.columns;
  const n = layout.visible.length;
  const rows = Math.ceil(n / cols);
  const fs = layout.fontSizePx;
  const gap = layout.gapPx;
  const rowH = Math.round(fs * 1.5);
  const areaLeft = safe.left;
  const areaRight = STORY_WIDTH - safe.right;
  const areaTop = safe.top;
  const areaBottom = STORY_HEIGHT - safe.bottom;
  const cellW = (areaRight - areaLeft) / cols;
  const gridH = rows * rowH + (rows - 1) * gap;
  const startY = areaTop + Math.max(0, (areaBottom - areaTop - gridH) / 2);
  const pillFill = hasPhoto ? 0.55 : 0.35;

  const out: string[] = [];
  layout.visible.forEach((slot, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = areaLeft + cellW * col + cellW / 2;
    const cyTop = startY + row * (rowH + gap);
    const cyMid = cyTop + rowH / 2;
    const pillW = Math.min(cellW - gap, textWidth(slot, fs) + 56);
    out.push(
      `<rect x="${cx - pillW / 2}" y="${cyTop}" width="${pillW}" height="${rowH}" rx="18" fill="#0a0908" fill-opacity="${pillFill}"/>`,
    );
    out.push(
      `<text x="${cx}" y="${cyMid + fs * 0.34}" fill="#ffffff" font-family="${FF}" font-weight="700" font-size="${fs}" text-anchor="middle">${esc(slot)}</text>`,
    );
  });
  return out.join('\n');
}
