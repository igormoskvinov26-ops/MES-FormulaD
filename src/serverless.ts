import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './api/server.js';
import { initSettings } from './config/settings.js';
import { logger } from './lib/logger.js';

/**
 * Vercel serverless entry. The whole Express app runs as a single function; all
 * routes are rewritten to it in vercel.json. Settings are loaded from the KV
 * backend once per cold start before the first request is handled.
 *
 * The background scheduler (node-cron) is intentionally NOT started here — on
 * serverless the jobs are driven by Vercel Cron hitting /api/cron/tick.
 */
const app = createApp();
let ready: Promise<unknown> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!ready) {
    ready = initSettings().catch((err) => {
      logger.error('settings init failed on cold start', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
  await ready;
  (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}
