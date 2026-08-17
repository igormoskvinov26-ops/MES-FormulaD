import { promises as fs } from 'node:fs';
import path from 'node:path';
import { STORY_COPY, STORY_HEIGHT, STORY_WIDTH, areaToPixels } from '../../config/templates.js';
import type { StoryRenderData } from './html.js';

/**
 * Browser-free Story composition as an SVG string, rasterised by resvg. Fixed
 * brand layout (spec §8); only slot values and the barber name/photo change.
 * Deterministic: same inputs → same SVG → same PNG (spec §10).
 *
 * Layout (matches the approved design):
 *   logo (top center) → "СВОБОДНЫЕ СЛОТЫ" → ◆ divider → "БАРБЕР {ИМЯ}"
 *   barber photo full-bleed on one side; free-time slots as a serif column on
 *   the opposite side.
 */
const ASSETS_DIR = process.env.ASSETS_DIR || path.resolve(process.cwd(), 'assets');
export const FONT_DIR = path.join(ASSETS_DIR, 'fonts');
export const FONT_FILES = [
  path.join(FONT_DIR, 'PlayfairDisplay-ExtraBold.ttf'),
  path.join(FONT_DIR, 'PlayfairDisplay-Bold.ttf'),
  path.join(FONT_DIR, 'PlayfairDisplay-SemiBold.ttf'),
  path.join(FONT_DIR, 'DejaVuSans.ttf'), // glyph fallback
];
export const DEFAULT_FONT_FAMILY = 'Playfair Display';
const FF = DEFAULT_FONT_FAMILY;
const GOLD = '#c8a24e';
const CREAM = '#f4efe6';

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

async function resolvePhoto(slug: string, explicit?: string): Promise<string | null> {
  const candidates = [explicit, `photos/${slug}.jpg`, `photos/${slug}.jpeg`, `photos/${slug}.png`].filter(
    Boolean,
  ) as string[];
  for (const rel of candidates) {
    const uri = await fileToDataUri(path.join(ASSETS_DIR, rel));
    if (uri) return uri;
  }
  return null;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const OUTLINE = 'stroke="#000000" stroke-opacity="0.5" stroke-width="3" paint-order="stroke"';

export async function buildStorySvg(data: StoryRenderData): Promise<string> {
  const { template } = data;
  const photoSide = template.photoSide;
  const isRaster = ['.png', '.jpg', '.jpeg'].includes(path.extname(template.backgroundAsset).toLowerCase());
  const photo = await resolvePhoto(template.barberSlug, isRaster ? template.backgroundAsset : undefined);
  const logo = await fileToDataUri(path.join(ASSETS_DIR, template.logoAsset));
  const name = (data.barberName || template.barberSlug).toUpperCase();

  const p: string[] = [];
  p.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${STORY_WIDTH}" height="${STORY_HEIGHT}" viewBox="0 0 ${STORY_WIDTH} ${STORY_HEIGHT}">`,
  );

  // gradients: base, top scrim, and a scrim that darkens the SLOTS side
  const slotsLeft = photoSide === 'right';
  p.push(`<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#171310"/><stop offset="0.55" stop-color="#0d0a08"/><stop offset="1" stop-color="#070605"/>
    </linearGradient>
    <linearGradient id="top" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="0.72"/>
      <stop offset="0.34" stop-color="#000000" stop-opacity="0.18"/>
      <stop offset="0.62" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="side" x1="${slotsLeft ? 0 : 1}" y1="0" x2="${slotsLeft ? 1 : 0}" y2="0">
      <stop offset="0" stop-color="#000000" stop-opacity="0.66"/>
      <stop offset="0.5" stop-color="#000000" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
  </defs>`);

  // background: barber photo full-bleed, or dark gradient placeholder
  if (photo) {
    p.push(
      `<image href="${photo}" x="0" y="0" width="${STORY_WIDTH}" height="${STORY_HEIGHT}" preserveAspectRatio="xMidYMid slice"/>`,
    );
  } else {
    p.push(`<rect width="${STORY_WIDTH}" height="${STORY_HEIGHT}" fill="url(#bg)"/>`);
    const hintX = slotsLeft ? 760 : 320;
    p.push(
      `<text x="${hintX}" y="1000" fill="#2c261e" font-family="${FF}" font-size="30" text-anchor="middle" letter-spacing="4">ФОТО МАСТЕРА</text>`,
    );
  }
  p.push(`<rect width="${STORY_WIDTH}" height="${STORY_HEIGHT}" fill="url(#side)"/>`);

  // Prebaked composition: the photo already has the logo + heading; overlay only
  // the slot column and the booking button.
  if (template.prebaked && photo) {
    p.push(renderSlotsColumn(data.slots, photoSide));
    p.push(ctaButton(template));
    p.push('</svg>');
    return p.join('\n');
  }

  p.push(`<rect width="${STORY_WIDTH}" height="${STORY_HEIGHT}" fill="url(#top)"/>`);

  // logo (original asset, only scaled/positioned)
  if (logo) {
    p.push(`<image href="${logo}" x="350" y="70" width="380" height="290" preserveAspectRatio="xMidYMid meet"/>`);
  } else {
    p.push(
      `<rect x="410" y="150" width="260" height="96" rx="8" fill="none" stroke="#6b5f52" stroke-width="2"/>` +
        `<text x="540" y="214" fill="#6b5f52" font-family="${FF}" font-weight="700" font-size="34" text-anchor="middle" letter-spacing="6">LOGO</text>`,
    );
  }

  // headline
  p.push(
    `<text x="540" y="486" fill="${GOLD}" font-family="${FF}" font-weight="800" font-size="82" text-anchor="middle" letter-spacing="4" ${OUTLINE}>${esc(STORY_COPY.headline)}</text>`,
  );
  // ◆ divider
  p.push(divider(540, 540));
  // subtitle "БАРБЕР {NAME}"
  p.push(
    `<text x="540" y="648" fill="${GOLD}" font-family="${FF}" font-weight="600" font-size="52" text-anchor="middle" letter-spacing="6" ${OUTLINE}>${esc(STORY_COPY.subtitlePrefix)} ${esc(name)}</text>`,
  );

  // slots column on the side opposite the photo
  p.push(renderSlotsColumn(data.slots, photoSide));

  p.push('</svg>');
  return p.join('\n');
}

/** Gold booking button ("ЗАПИСАТЬСЯ →") drawn from the template's ctaArea so the
 * visible button and the Telegram tap link-area coincide. */
function ctaButton(template: StoryRenderData['template']): string {
  const c = areaToPixels(template.ctaArea);
  const x = c.x - c.width / 2;
  const y = c.y - c.height / 2;
  return (
    `<rect x="${x}" y="${y}" width="${c.width}" height="${c.height}" rx="${Math.round(c.height / 2)}" fill="#e8c37a"/>` +
    `<text x="${c.x}" y="${c.y + 16}" fill="#0a0908" font-family="${FF}" font-weight="700" font-size="44" text-anchor="middle" letter-spacing="1">${esc(STORY_COPY.cta)}</text>`
  );
}

function divider(cx: number, y: number): string {
  const half = 170;
  const d = 11;
  return (
    `<line x1="${cx - half}" y1="${y}" x2="${cx - 26}" y2="${y}" stroke="${GOLD}" stroke-width="2"/>` +
    `<line x1="${cx + 26}" y1="${y}" x2="${cx + half}" y2="${y}" stroke="${GOLD}" stroke-width="2"/>` +
    `<rect x="${cx - d}" y="${y - d}" width="${d * 2}" height="${d * 2}" fill="${GOLD}" transform="rotate(45 ${cx} ${y})"/>`
  );
}

/**
 * Vertical serif column of slots on the side opposite the photo. Font size adapts
 * to the count so it stays within the safe band (spec §9); if there are too many,
 * show the nearest ones.
 */
function renderSlotsColumn(slots: string[], photoSide: 'left' | 'right'): string {
  const cx = photoSide === 'left' ? 770 : 310; // slots go opposite the photo
  if (slots.length === 0) {
    return `<text x="${cx}" y="1060" fill="${CREAM}" font-family="Playfair Display" font-weight="700" font-size="60" text-anchor="middle" ${OUTLINE}>—</text>`;
  }

  // Show the nearest few (design shows ~5); truthful subset when there are many.
  const MAX = 6;
  const list = slots.slice(0, MAX);
  const n = list.length;
  const fontSize = n <= 5 ? 92 : 80;
  const lineH = Math.round(fontSize * 1.28);
  const topBand = 800;
  const bottomBand = 1420; // leave room for the booking button below
  const blockH = n * lineH;
  let startY = topBand + (bottomBand - topBand - blockH) / 2 + fontSize * 0.75;
  if (startY < topBand + fontSize) startY = topBand + fontSize;

  const out: string[] = [];
  list.forEach((slot, i) => {
    const y = Math.round(startY + i * lineH);
    out.push(
      `<text x="${cx}" y="${y}" fill="${CREAM}" font-family="Playfair Display" font-weight="700" font-size="${fontSize}" text-anchor="middle" letter-spacing="2" ${OUTLINE}>${esc(slot)}</text>`,
    );
  });
  return out.join('\n');
}
