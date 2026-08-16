import { Router, type Request, type Response } from 'express';
import { activeBarbers, barberBySlug } from '../../config/barbers.js';
import { templateForBarber } from '../../config/templates.js';
import { getSettings, yclientsConfigured } from '../../config/settings.js';
import { toUserMessage } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { todayMsk } from '../../lib/time.js';
import { dashboardStatus, integrationsHealth } from '../../services/health.js';
import {
  buildStoryPlan,
  deleteTestStory,
  publishStory,
  renderStoryForPlan,
} from '../../services/stories/index.js';
import { renderStoryPng } from '../../services/stories/renderer.js';
import { listStoryStates } from '../../services/stories/state.js';
import { previewDailyReport, sendDailyReport } from '../../services/reporting/index.js';

export const adminRouter = Router();

function dateParam(req: Request): string {
  const d = (req.query.date as string) || (req.body?.date as string);
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayMsk();
}

function fail(res: Response, err: unknown, status = 400) {
  logger.error('admin route error', { error: err instanceof Error ? err.message : String(err) });
  res.status(status).json({ ok: false, error: toUserMessage(err) });
}

// ---------------------------------------------------------------------------
// Health & dashboard
// ---------------------------------------------------------------------------
adminRouter.get('/integrations/health', async (_req, res) => {
  try {
    res.json(await integrationsHealth());
  } catch (err) {
    fail(res, err, 500);
  }
});

adminRouter.get('/dashboard', async (_req, res) => {
  try {
    res.json(await dashboardStatus());
  } catch (err) {
    fail(res, err, 500);
  }
});

// ---------------------------------------------------------------------------
// Today — working staff + real free slots
// ---------------------------------------------------------------------------
adminRouter.get('/today', async (req, res) => {
  const date = dateParam(req);
  if (!yclientsConfigured()) {
    return res.json({ date, configured: false, barbers: [] });
  }
  try {
    const out = [];
    for (const barber of activeBarbers()) {
      const plan = await buildStoryPlan(barber, date);
      out.push({
        slug: barber.slug,
        displayName: barber.displayName,
        staffId: barber.yclientsStaffId,
        worksToday: plan.worksToday,
        shift: plan.worksToday ? `${plan.shiftStart ?? '?'}–${plan.shiftEnd ?? '?'}` : null,
        slots: plan.slots,
        shouldPublish: plan.shouldPublish,
      });
    }
    res.json({ date, configured: true, barbers: out });
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------
adminRouter.get('/stories/status', async (req, res) => {
  const date = dateParam(req);
  try {
    res.json({ date, stories: await listStoryStates(date) });
  } catch (err) {
    fail(res, err, 500);
  }
});

adminRouter.post('/stories/refresh', async (req, res) => {
  const date = dateParam(req);
  try {
    const plans = [];
    for (const barber of activeBarbers()) {
      plans.push(await buildStoryPlan(barber, date));
    }
    res.json({ date, plans });
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Preview returns the EXACT PNG that would be published (spec §41).
 * Optional `?slots=13:30,16:00` renders a design-only preview with manual slots
 * (marked via X-Preview-Mode) so templates can be checked without live data.
 */
adminRouter.get('/stories/preview', async (req, res) => {
  const slug = String(req.query.slug || '');
  const date = dateParam(req);
  const barber = barberBySlug(slug);
  if (!barber) return fail(res, new Error('unknown barber slug'));
  const template = templateForBarber(slug);
  if (!template) return fail(res, new Error('template missing'));

  try {
    const manualSlots = (req.query.slots as string | undefined)?.split(',').map((s) => s.trim()).filter(Boolean);
    let png: Buffer;
    if (manualSlots && manualSlots.length) {
      res.setHeader('X-Preview-Mode', 'manual-slots');
      png = await renderStoryPng({ template, slots: manualSlots });
    } else {
      const plan = await buildStoryPlan(barber, date);
      res.setHeader('X-Preview-Mode', 'live');
      png = await renderStoryForPlan(plan);
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.end(png);
  } catch (err) {
    fail(res, err);
  }
});

adminRouter.post('/stories/publish-test', async (req, res) => {
  const date = dateParam(req);
  const slug = String(req.body?.slug || req.query.slug || '');
  const period = String(req.body?.period || 'manual');
  const barber = barberBySlug(slug);
  if (!barber) return fail(res, new Error('unknown barber slug'));
  try {
    const result = await publishStory(barber, date, { period, target: 'test', photoFallback: true });
    res.json({ ok: true, result });
  } catch (err) {
    fail(res, err);
  }
});

// "Обновить Story" — same publish path; it edits an existing Story when present.
adminRouter.post('/stories/update', async (req, res) => {
  const date = dateParam(req);
  const slug = String(req.body?.slug || req.query.slug || '');
  const barber = barberBySlug(slug);
  if (!barber) return fail(res, new Error('unknown barber slug'));
  try {
    const result = await publishStory(barber, date, { period: 'manual', target: 'test', photoFallback: true });
    res.json({ ok: true, result });
  } catch (err) {
    fail(res, err);
  }
});

adminRouter.post('/stories/delete-test', async (req, res) => {
  const date = dateParam(req);
  const slug = String(req.body?.slug || req.query.slug || '');
  const barber = barberBySlug(slug);
  if (!barber) return fail(res, new Error('unknown barber slug'));
  try {
    const result = await deleteTestStory(barber, date);
    res.json({ ok: true, result });
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
adminRouter.post('/report/generate', async (req, res) => {
  const date = dateParam(req);
  try {
    res.json({ ok: true, ...(await previewDailyReport(date)) });
  } catch (err) {
    fail(res, err);
  }
});

adminRouter.get('/report/preview', async (req, res) => {
  const date = dateParam(req);
  try {
    res.json({ ok: true, ...(await previewDailyReport(date)) });
  } catch (err) {
    fail(res, err);
  }
});

adminRouter.post('/report/send-test', async (req, res) => {
  const date = dateParam(req);
  try {
    const result = await sendDailyReport(date, 'test');
    const tg = getSettings().telegram;
    res.json({ ok: true, mode: tg.mode, dryRun: tg.dryRun, send: result.send, text: result.text });
  } catch (err) {
    fail(res, err);
  }
});

// NOTE: there is intentionally no production publish route. Production requires
// switching TELEGRAM_MODE, and TelegramService blocks production while in test.
