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
 * Text layout is explicit (SVG has no auto-wrap/flexbox), driven by the same
 * layout logic used everywhere so counts 1..N stay within the safe area.
 */
const ASSETS_DIR = process.env.ASSETS_DIR || path.resolve(process.cwd(), 'assets');
export const FONT_DIR = path.join(ASSETS_DIR, 'fonts');
export const FONT_FILES = [path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'), path.join(FONT_DIR, 'DejaVuSans.ttf')];
export const DEFAULT_FONT_FAMILY = 'DejaVu Sans';

async function rasterDataUri(rel: string): Promise<string | null> {
  const ext = path.extname(rel).toLowerCase();
  if (!['.png', '.jpg', '.jpeg'].includes(ext)) return null; // resvg embeds raster only
  try {
    const buf = await fs.readFile(path.join(ASSETS_DIR, rel));
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Rough text width for DejaVu Sans Bold (used to size slot pills). */
function textWidth(s: string, fontSize: number): number {
  return s.length * fontSize * 0.62;
}

export async function buildStorySvg(data: StoryRenderData): Promise<string> {
  const { template } = data;
  const bg = await rasterDataUri(template.backgroundAsset); // null for SVG/placeholder
  const logo = await rasterDataUri(template.logoAsset);
  const layout = planSlotLayout(data.slots);
  const cta = areaToPixels(template.ctaArea);
  const safe = template.slotsSafeArea;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${STORY_WIDTH}" height="${STORY_HEIGHT}" viewBox="0 0 ${STORY_WIDTH} ${STORY_HEIGHT}">`,
  );

  // defs: background gradient + scrim
  parts.push(`<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#171310"/><stop offset="0.55" stop-color="#0d0a08"/><stop offset="1" stop-color="#070605"/>
    </linearGradient>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="0.35"/><stop offset="0.3" stop-color="#000000" stop-opacity="0"/>
      <stop offset="0.78" stop-color="#000000" stop-opacity="0.55"/>
    </linearGradient>
  </defs>`);

  // background: raster photo if provided, else gradient placeholder
  if (bg) {
    parts.push(
      `<image href="${bg}" x="0" y="0" width="${STORY_WIDTH}" height="${STORY_HEIGHT}" preserveAspectRatio="xMidYMid slice"/>`,
    );
  } else {
    parts.push(`<rect width="${STORY_WIDTH}" height="${STORY_HEIGHT}" fill="url(#bg)"/>`);
    parts.push(
      `<text x="540" y="700" fill="#2c261e" font-family="${DEFAULT_FONT_FAMILY}" font-size="30" text-anchor="middle" letter-spacing="4">ФОТО МАСТЕРА</text>`,
    );
  }
  parts.push(`<rect width="${STORY_WIDTH}" height="${STORY_HEIGHT}" fill="url(#scrim)"/>`);

  // logo (original asset only scaled/positioned; placeholder box if missing)
  if (logo) {
    parts.push(
      `<image href="${logo}" x="310" y="60" width="460" height="300" preserveAspectRatio="xMidYMid meet"/>`,
    );
  } else {
    parts.push(
      `<rect x="390" y="120" width="300" height="110" rx="8" fill="none" stroke="#6b5f52" stroke-width="2"/>` +
        `<text x="540" y="192" fill="#6b5f52" font-family="${DEFAULT_FONT_FAMILY}" font-weight="bold" font-size="38" text-anchor="middle" letter-spacing="6">LOGO</text>`,
    );
  }

  // headline
  parts.push(
    `<text x="540" y="420" fill="#f5f0e8" font-family="${DEFAULT_FONT_FAMILY}" font-weight="bold" font-size="54" text-anchor="middle" letter-spacing="1">${esc(STORY_COPY.headline)}</text>`,
  );

  // optional date
  if (data.dateLabel) {
    parts.push(
      `<text x="540" y="500" fill="#d9cbb4" font-family="${DEFAULT_FONT_FAMILY}" font-weight="bold" font-size="30" text-anchor="middle" letter-spacing="3">${esc(data.dateLabel)}</text>`,
    );
  }

  // slots grid within the safe area
  parts.push(renderSlots(layout, safe));

  // CTA pill with the fixed booking call-to-action
  parts.push(
    `<rect x="${cta.x - cta.width / 2}" y="${cta.y - cta.height / 2}" width="${cta.width}" height="${cta.height}" rx="${cta.height / 2}" fill="#e8c37a"/>` +
      `<text x="${cta.x}" y="${cta.y + 18}" fill="#0a0908" font-family="${DEFAULT_FONT_FAMILY}" font-weight="bold" font-size="52" text-anchor="middle" letter-spacing="1">${esc(STORY_COPY.cta)}</text>`,
  );

  // brand phrase
  parts.push(
    `<text x="540" y="1830" fill="#cbb892" font-family="${DEFAULT_FONT_FAMILY}" font-weight="bold" font-size="30" text-anchor="middle" letter-spacing="4">${esc(STORY_COPY.brandPhrase)}</text>`,
  );

  parts.push('</svg>');
  return parts.join('\n');
}

function renderSlots(
  layout: ReturnType<typeof planSlotLayout>,
  safe: { top: number; bottom: number; left: number; right: number },
): string {
  if (layout.visible.length === 0) {
    return `<text x="540" y="960" fill="#d9cbb4" font-family="${DEFAULT_FONT_FAMILY}" font-weight="bold" font-size="48" text-anchor="middle">Скоро новые окна</text>`;
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

  const out: string[] = [];
  layout.visible.forEach((slot, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = areaLeft + cellW * col + cellW / 2;
    const cyTop = startY + row * (rowH + gap);
    const cyMid = cyTop + rowH / 2;
    const pillW = Math.min(cellW - gap, textWidth(slot, fs) + 52);
    out.push(
      `<rect x="${cx - pillW / 2}" y="${cyTop}" width="${pillW}" height="${rowH}" rx="18" fill="#141210" fill-opacity="0.35"/>`,
    );
    out.push(
      `<text x="${cx}" y="${cyMid + fs * 0.35}" fill="#ffffff" font-family="${DEFAULT_FONT_FAMILY}" font-weight="bold" font-size="${fs}" text-anchor="middle">${esc(slot)}</text>`,
    );
  });
  return out.join('\n');
}
