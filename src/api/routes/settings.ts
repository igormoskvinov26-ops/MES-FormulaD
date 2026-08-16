import { Router, type Request, type Response } from 'express';
import {
  getSafeSettings,
  getSettings,
  updateSettings,
  type SettingsPatch,
} from '../../config/settings.js';
import { toUserMessage } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { integrationsHealth } from '../../services/health.js';
import { restartScheduler } from '../../services/scheduler/scheduler.js';
import { telegramService } from '../../services/telegram/service.js';
import { authenticate, listMyCompanies, listStaff } from '../../services/yclients/setup.js';

export const settingsRouter = Router();

function fail(res: Response, err: unknown, status = 400) {
  logger.error('settings route error', { error: err instanceof Error ? err.message : String(err) });
  res.status(status).json({ ok: false, error: toUserMessage(err) });
}

const HHmm = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------------------------------------------------------------------------
// Read / write settings (masked)
// ---------------------------------------------------------------------------
settingsRouter.get('/', (_req, res) => {
  res.json({ ok: true, settings: getSafeSettings() });
});

settingsRouter.post('/', (req, res) => {
  try {
    const body = (req.body ?? {}) as SettingsPatch;
    // light validation for schedule times
    if (body.schedule) {
      for (const [k, v] of Object.entries(body.schedule)) {
        if (v !== undefined && !HHmm.test(String(v))) {
          return fail(res, new Error(`Invalid time for ${k}: expected HH:mm`));
        }
      }
    }
    if (body.telegram?.mode && !['test', 'production'].includes(body.telegram.mode)) {
      return fail(res, new Error('mode must be test or production'));
    }
    const before = getSettings().schedule;
    const next = updateSettings(body);
    // re-arm scheduler if any schedule time changed
    const changed =
      before.morning !== next.schedule.morning ||
      before.day !== next.schedule.day ||
      before.evening !== next.schedule.evening ||
      before.dailyReport !== next.schedule.dailyReport;
    if (changed) restartScheduler();
    res.json({ ok: true, settings: getSafeSettings(), schedulerReloaded: changed });
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// YCLIENTS connection wizard
// ---------------------------------------------------------------------------
settingsRouter.post('/yclients/auth', async (req, res) => {
  const login = String(req.body?.login || '');
  const password = String(req.body?.password || '');
  if (!login || !password) return fail(res, new Error('login and password are required'));
  try {
    const result = await authenticate(login, password);
    if (!result.ok) return fail(res, new Error(result.error));
    updateSettings({ yclients: { userToken: result.userToken } });
    res.json({ ok: true, name: result.name, userTokenSet: true });
  } catch (err) {
    fail(res, err);
  }
});

settingsRouter.get('/yclients/companies', async (_req, res) => {
  try {
    res.json({ ok: true, companies: await listMyCompanies() });
  } catch (err) {
    fail(res, err);
  }
});

settingsRouter.get('/yclients/staff', async (req, res) => {
  const companyId = String(req.query.companyId || getSettings().yclients.companyId || '');
  if (!companyId) return fail(res, new Error('companyId is required'));
  try {
    res.json({ ok: true, staff: await listStaff(companyId) });
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// Telegram helpers
// ---------------------------------------------------------------------------
settingsRouter.post('/telegram/detect-chat', async (_req, res) => {
  try {
    const chats = await telegramService().detectChats();
    res.json({ ok: true, chats });
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// Connection test
// ---------------------------------------------------------------------------
settingsRouter.post('/test', async (_req, res) => {
  try {
    const me = await telegramService().getMe();
    const business = await telegramService().checkBusinessConnection();
    const integrations = await integrationsHealth();
    res.json({ ok: true, telegram: me, business, integrations });
  } catch (err) {
    fail(res, err, 500);
  }
});
