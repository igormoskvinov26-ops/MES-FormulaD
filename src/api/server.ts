import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { adminRouter } from './routes/admin.js';
import { settingsRouter } from './routes/settings.js';
import { cronRouter } from './routes/cron.js';
import { importRouter } from './routes/import.js';

const WEB_DIR = process.env.WEB_DIR || path.resolve(process.cwd(), 'web');

/**
 * Admin auth: if ADMIN_API_TOKENS is set, require a matching `x-admin-token`
 * header (or `?token=`). If unset, only allow loopback callers (dev). Secrets
 * are never returned in responses.
 */
function adminAuth(req: Request, res: Response, next: NextFunction) {
  const tokens = env.server.adminTokens;
  if (tokens.length === 0) {
    const ip = req.ip || '';
    const isLocal = ip === '127.0.0.1' || ip === '::1' || ip.endsWith('127.0.0.1');
    if (!isLocal) {
      return res.status(401).json({ ok: false, error: 'Admin API is locked down (set ADMIN_API_TOKENS)' });
    }
    return next();
  }
  const provided = (req.header('x-admin-token') || (req.query.token as string) || '').trim();
  if (!provided || !tokens.includes(provided)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Liveness — no secrets.
  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  // Cron endpoints authenticate via CRON_SECRET (not the admin token).
  app.use('/api/cron', cronRouter);

  app.use('/api/admin/settings', adminAuth, settingsRouter);
  app.use('/api/admin/import', adminAuth, importRouter);
  app.use('/api/admin', adminAuth, adminRouter);

  // Static admin UI.
  app.use('/', express.static(WEB_DIR));

  // Fallback error handler — never leaks stack traces to the client.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('unhandled http error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, error: 'Internal error' });
  });

  return app;
}

export function startServer() {
  const app = createApp();
  return app.listen(env.server.port, () => {
    logger.info('http server listening', { port: env.server.port });
  });
}
