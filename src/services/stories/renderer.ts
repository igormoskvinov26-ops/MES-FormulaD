import { chromium, type Browser } from 'playwright-core';
import { STORY_HEIGHT, STORY_WIDTH } from '../../config/templates.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { buildStoryHtml, type StoryRenderData } from './html.js';

/**
 * Deterministic 1080×1920 PNG renderer using the project's Chromium via
 * Playwright. Same inputs → same PNG (spec §10). No AI image generation at
 * runtime.
 */

const EXECUTABLE_PATH =
  process.env.CHROMIUM_EXECUTABLE_PATH || '/opt/pw-browsers/chromium';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        executablePath: EXECUTABLE_PATH,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
      })
      .catch((err) => {
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
