import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  STORY_COPY,
  STORY_HEIGHT,
  STORY_WIDTH,
  areaToPixels,
  type TemplateConfig,
} from '../../config/templates.js';
import { planSlotLayout } from './layout.js';

const ASSETS_DIR = process.env.ASSETS_DIR || path.resolve(process.cwd(), 'assets');

async function readAssetAsDataUri(rel: string): Promise<string | null> {
  try {
    const full = path.join(ASSETS_DIR, rel);
    const buf = await fs.readFile(full);
    const ext = path.extname(rel).toLowerCase();
    const mime =
      ext === '.svg'
        ? 'image/svg+xml'
        : ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : 'application/octet-stream';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export type StoryRenderData = {
  template: TemplateConfig;
  slots: string[];
  /** Optional date label shown when useful. */
  dateLabel?: string;
};

/**
 * Build the FIXED story HTML. This single skeleton is the fixed composition
 * (spec §8); only the slot values (and optional date) are injected. It is not
 * regenerated per run — the same inputs always yield the same HTML → same PNG
 * (deterministic, spec §10).
 */
export async function buildStoryHtml(data: StoryRenderData): Promise<string> {
  const { template } = data;
  const background = await readAssetAsDataUri(template.backgroundAsset);
  const logo = await readAssetAsDataUri(template.logoAsset);

  const layout = planSlotLayout(data.slots);
  const cta = areaToPixels(template.ctaArea);
  const safe = template.slotsSafeArea;

  const slotsHtml =
    layout.visible.length > 0
      ? layout.visible
          .map((t) => `<div class="slot">${escapeHtml(t)}</div>`)
          .join('')
      : '';

  // Logo layer: only the ORIGINAL asset is placed/scaled. When absent, a
  // neutral labeled placeholder is shown — never an imitation of the brand mark.
  const logoLayer = logo
    ? `<img class="logo" src="${logo}" alt="" />`
    : `<div class="logo logo-missing">LOGO</div>`;

  const backgroundLayer = background
    ? `<img class="bg" src="${background}" alt="" />`
    : `<div class="bg bg-missing"></div>`;

  const dateLine = data.dateLabel
    ? `<div class="date">${escapeHtml(data.dateLabel)}</div>`
    : '';

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${STORY_WIDTH}px; height: ${STORY_HEIGHT}px; }
  body {
    position: relative; overflow: hidden;
    font-family: 'Arial', 'Helvetica', sans-serif;
    color: #f5f0e8; background: #0a0908;
    -webkit-font-smoothing: antialiased;
  }
  .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .bg-missing { background: linear-gradient(#141210, #0a0908); }
  .overlay { position: absolute; inset: 0; background:
    linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 78%); }
  .logo {
    position: absolute; top: 96px; left: 50%; transform: translateX(-50%);
    width: 260px; height: auto; max-height: 130px; object-fit: contain;
  }
  .logo-missing {
    display: flex; align-items: center; justify-content: center;
    width: 260px; height: 90px; border: 2px dashed #6b5f52; color: #6b5f52;
    letter-spacing: 6px; font-size: 34px; border-radius: 8px;
  }
  .headline {
    position: absolute; top: 168px; left: 60px; right: 60px; text-align: center;
    font-size: 54px; font-weight: 800; letter-spacing: 1px; line-height: 1.1;
    text-transform: uppercase; text-shadow: 0 4px 24px rgba(0,0,0,0.6);
  }
  .date {
    position: absolute; top: 320px; left: 0; right: 0; text-align: center;
    font-size: 30px; font-weight: 600; color: #d9cbb4; letter-spacing: 3px;
    text-shadow: 0 2px 12px rgba(0,0,0,0.8);
  }
  .slots {
    position: absolute;
    top: ${safe.top}px; left: ${safe.left}px; right: ${safe.right}px;
    bottom: ${safe.bottom}px;
    display: grid;
    grid-template-columns: repeat(${layout.columns}, 1fr);
    gap: ${layout.gapPx}px;
    align-content: center; justify-items: center;
  }
  .slot {
    font-size: ${layout.fontSizePx}px; font-weight: 800; line-height: 1;
    color: #ffffff; text-shadow: 0 3px 18px rgba(0,0,0,0.7);
    background: rgba(20,18,16,0.35); padding: 10px 26px; border-radius: 18px;
  }
  .empty {
    position: absolute; top: 45%; left: 60px; right: 60px; text-align: center;
    font-size: 48px; font-weight: 700; color: #d9cbb4;
  }
  .cta {
    position: absolute;
    left: ${cta.x - cta.width / 2}px; top: ${cta.y - cta.height / 2}px;
    width: ${cta.width}px; height: ${cta.height}px;
    display: flex; align-items: center; justify-content: center;
    font-size: 52px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
    color: #0a0908; background: #e8c37a; border-radius: 999px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.45);
  }
  .brand {
    position: absolute; bottom: 90px; left: 60px; right: 60px; text-align: center;
    font-size: 30px; font-weight: 600; letter-spacing: 4px; color: #cbb892;
    text-transform: uppercase;
  }
</style>
</head>
<body>
  ${backgroundLayer}
  <div class="overlay"></div>
  ${logoLayer}
  <div class="headline">${escapeHtml(STORY_COPY.headline)}</div>
  ${dateLine}
  ${slotsHtml ? `<div class="slots">${slotsHtml}</div>` : `<div class="empty">Скоро новые окна</div>`}
  <div class="cta">${escapeHtml(STORY_COPY.cta)}</div>
  <div class="brand">${escapeHtml(STORY_COPY.brandPhrase)}</div>
</body>
</html>`;
}
