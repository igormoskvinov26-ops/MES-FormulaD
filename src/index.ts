import { missingCredentials, safeConfigSnapshot, getSettings } from './config/settings.js';
import { activeBarbers } from './config/barbers.js';
import { logger } from './lib/logger.js';
import { formatMsk } from './lib/time.js';
import { startServer } from './api/server.js';
import { startScheduler, stopScheduler } from './services/scheduler/scheduler.js';
import { closeRenderer } from './services/stories/renderer.js';

/** Application entry point: HTTP API + background scheduler. */
function main() {
  logger.info('Rubl Telegram Admin starting', {
    now: formatMsk(),
    config: safeConfigSnapshot(),
    activeBarbers: activeBarbers().map((b) => b.slug),
  });

  const missing = missingCredentials();
  if (missing.length) {
    logger.warn('missing credentials — related features will be inert until provided', { missing });
  }
  if (getSettings().telegram.mode === 'test') {
    logger.info('TELEGRAM_MODE=test — all sends go to the TEST contour; production is blocked');
  }

  const server = startServer();
  startScheduler();

  const shutdown = async (signal: string) => {
    logger.info('shutting down', { signal });
    stopScheduler();
    await closeRenderer();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main();
