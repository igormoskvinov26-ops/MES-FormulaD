import { STORY_HEIGHT, STORY_WIDTH } from '../../config/templates.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { StoryRenderData } from './html.js';
import { buildStorySvg, FONT_FILES, DEFAULT_FONT_FAMILY } from './svg.js';

/**
 * Deterministic 1080×1920 PNG renderer. Same inputs → same PNG (spec §10). No AI
 * image generation at runtime.
 *
 * Default engine is **resvg** (SVG → PNG): tiny, fast (~tens of ms), no browser,
 * so it runs on free serverless tiers (e.g. Vercel Hobby) well within the 10 s
 * function limit. Preview and publish use the SAME engine, so the preview PNG is
 * exactly what ships (spec §41).
 *
 * Set RENDERER=chromium to use the Playwright/Chromium HTML engine instead
 * (heavier; needs a Chromium binary and, on serverless, more time/memory).
 */
const ENGINE = (process.env.RENDERER || 'resvg').toLowerCase();

// ---------------------------------------------------------------------------
// resvg (default, browser-free)
// ---------------------------------------------------------------------------
async function renderWithResvg(data: StoryRenderData): Promise<Buffer> {
  let svg: string;
  try {
    svg = await buildStorySvg(data);
  } catch (err) {
    throw Errors.storyRenderingFailed(err);
  }
  try {
    const { Resvg } = await import('@resvg/resvg-js');
    const resvg = new Resvg(svg, {
      background: '#0a0908',
      fitTo: { mode: 'width', value: STORY_WIDTH },
      font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: DEFAULT_FONT_FAMILY },
    });
    return Buffer.from(resvg.render().asPng());
  } catch (err) {
    logger.error('resvg render failed', { error: err instanceof Error ? err.message : String(err) });
    throw Errors.storyRenderingFailed(err);
  }
}

// ---------------------------------------------------------------------------
// Chromium (optional, RENDERER=chromium)
// ---------------------------------------------------------------------------
const EXECUTABLE_PATH = process.env.CHROMIUM_EXECUTABLE_PATH || '/opt/pw-browsers/chromium';
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
let browserPromise: Promise<import('playwright-core').Browser> | null = null;

async function launch() {
  const { chromium: pwChromium } = await import('playwright-core');
  if (IS_SERVERLESS) {
    const mod = (await import('@sparticuz/chromium')) as unknown as {
      default: { args: string[]; executablePath: () => Promise<string>; headless: boolean };
    };
    const chromium = mod.default;
    return pwChromium.launch({
      args: [...chromium.args, '--force-color-profile=srgb'],
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  return pwChromium.launch({
    executablePath: EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
  });
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = launch().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

async function renderWithChromium(data: StoryRenderData): Promise<Buffer> {
  const { buildStoryHtml } = await import('./html.js');
  let html: string;
  try {
    html = await buildStoryHtml(data);
  } catch (err) {
    throw Errors.storyRenderingFailed(err);
  }
  try {
    const browser = await getBrowser();
    const context = await browser.newContext({
      viewport: { width: STORY_WIDTH, height: STORY_HEIGHT },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
    });
    try {
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: 'networkidle' });
      const png = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: STORY_WIDTH, height: STORY_HEIGHT },
        animations: 'disabled',
      });
      return Buffer.from(png);
    } finally {
      await context.close();
    }
  } catch (err) {
    logger.error('story render failed', { error: err instanceof Error ? err.message : String(err) });
    throw Errors.storyRenderingFailed(err);
  }
}

// ---------------------------------------------------------------------------
export async function renderStoryPng(data: StoryRenderData): Promise<Buffer> {
  const png = ENGINE === 'chromium' ? await renderWithChromium(data) : await renderWithResvg(data);
  if (!png || png.length === 0) throw Errors.storyRenderingFailed(new Error('empty PNG'));
  return png;
}

/** Close the shared browser (graceful shutdown / tests). No-op for resvg. */
export async function closeRenderer(): Promise<void> {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      await b.close();
    } catch {
      /* ignore */
    }
    browserPromise = null;
  }
}
