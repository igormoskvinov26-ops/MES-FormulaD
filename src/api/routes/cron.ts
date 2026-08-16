import { Router, type Request, type Response } from 'express';
import { getSettings } from '../../config/settings.js';
import { storage, setMeta } from '../../store/backend.js';
import { logger } from '../../lib/logger.js';
import { businessDateTime, nowMsk, todayMsk } from '../../lib/time.js';
import { runDailyReportJob, runStoryJob, type StoryPeriod } from '../../services/scheduler/jobs.js';

/**
 * Cron endpoints for serverless (Vercel Cron). Vercel has no always-on process,
 * so instead of node-cron a periodic HTTP tick drives the jobs.
 *
 * `/api/cron/tick` is schedule-aware and idempotent: for each period it runs the
 * job once per day, at or after the time configured in Settings (Europe/Moscow),
 * using a per-day marker so any cron cadence works and nothing double-fires.
 *
 * Protected by CRON_SECRET (Vercel sends `Authorization: Bearer <CRON_SECRET>`).
 */
export const cronRouter = Router();

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // must be configured
  const header = req.header('authorization') || '';
  if (header === `Bearer ${secret}`) return true;
  if ((req.query.secret as string) === secret) return true;
  return false;
}

async function alreadyRan(marker: string): Promise<boolean> {
  return Boolean(await storage().getRaw(`meta:cronran:${marker}`));
}
async function markRan(marker: string): Promise<void> {
  await setMeta(`cronran:${marker}`, new Date().toISOString());
}

cronRouter.get('/tick', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const date = todayMsk();
  const now = nowMsk();
  const schedule = getSettings().schedule;
  const ran: string[] = [];

  const storyPeriods: Array<[StoryPeriod, string]> = [
    ['morning', schedule.morning],
    ['day', schedule.day],
    ['evening', schedule.evening],
  ];

  for (const [period, hhmm] of storyPeriods) {
    const due = now >= businessDateTime(date, hhmm);
    const marker = `story:${period}:${date}`;
    if (due && !(await alreadyRan(marker))) {
      await markRan(marker);
      try {
        await runStoryJob(period, date);
        ran.push(`story:${period}`);
      } catch (err) {
        logger.error('cron story job failed', { period, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  const reportMarker = `daily-report:${date}`;
  if (now >= businessDateTime(date, schedule.dailyReport) && !(await alreadyRan(reportMarker))) {
    await markRan(reportMarker);
    try {
      await runDailyReportJob(date);
      ran.push('daily-report');
    } catch (err) {
      logger.error('cron report job failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  res.json({ ok: true, date, now: now.toFormat('HH:mm'), ran });
});

/** Explicit single-job trigger (also usable by external schedulers). */
cronRouter.get('/run', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const job = String(req.query.job || '');
  const date = todayMsk();
  try {
    if (job === 'story-morning') return res.json({ ok: true, result: await runStoryJob('morning', date) });
    if (job === 'story-day') return res.json({ ok: true, result: await runStoryJob('day', date) });
    if (job === 'story-evening') return res.json({ ok: true, result: await runStoryJob('evening', date) });
    if (job === 'daily-report') return res.json({ ok: true, result: await runDailyReportJob(date) });
    return res.status(400).json({ ok: false, error: 'unknown job' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'job failed' });
  }
});
