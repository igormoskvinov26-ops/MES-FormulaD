import { chromium as pwChromium, type Browser } from 'playwright-core';
import { STORY_HEIGHT, STORY_WIDTH } from '../../config/templates.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { buildStoryHtml, type StoryRenderData } from './html.js';

/**
 * Deterministic 1080×1920 PNG renderer using Chromium via Playwright. Same
 * inputs → same PNG (spec §10). No AI image generation at runtime.
 *
 * Two runtimes:
 *  - serverless (Vercel/Lambda) → @sparticuz/chromium (bundled headless build)
 *  - local / always-on          → local Chromium (CHROMIUM_EXECUTABLE_PATH or
 *    the project's /opt/pw-browsers/chromium)
 */

const EXECUTABLE_PATH = process.env.CHROMIUM_EXECUTABLE_PATH || '/opt/pw-browsers/chromium';
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

let browserPromise: Promise<Browser> | null = null;

async function launch(): Promise<Browser> {
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

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launch().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

export async function renderStoryPng(data: StoryRenderData): Promise<Buffer> {
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
    logger.error('story render failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw Errors.storyRenderingFailed(err);
  }
}

/** Close the shared browser (graceful shutdown / tests). */
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
