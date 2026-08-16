import cron, { type ScheduledTask } from 'node-cron';
import { env, BUSINESS_TZ } from '../../config/env.js';
import { getSettings } from '../../config/settings.js';
import { logger } from '../../lib/logger.js';
import { formatMsk, nowMsk, parseHHmm } from '../../lib/time.js';
import { runDailyReportJob, runDayStoryJob, runEveningStoryJob, runMorningStoryJob } from './jobs.js';

/**
 * Cron scheduler running in Europe/Moscow. Times come from the runtime settings
 * store (HH:mm). The scheduler only triggers jobs — it holds no business logic.
 * Call restartScheduler() after settings change to apply new times.
 */

type Job = { name: string; hhmm: string; run: () => Promise<unknown>; task?: ScheduledTask };

let jobs: Job[] = [];
let started = false;
let lastRun: Record<string, string> = {};

function cronExpr(hhmm: string): string {
  const { hour, minute } = parseHHmm(hhmm);
  return `${minute} ${hour} * * *`;
}

export function startScheduler(): void {
  if (started) return;
  if (!env.server.schedulerEnabled) {
    logger.warn('scheduler disabled via SCHEDULER_ENABLED=false');
    return;
  }

  const schedule = getSettings().schedule;
  jobs = [
    { name: 'story:morning', hhmm: schedule.morning, run: wrap('story:morning', runMorningStoryJob) },
    { name: 'story:day', hhmm: schedule.day, run: wrap('story:day', runDayStoryJob) },
    { name: 'story:evening', hhmm: schedule.evening, run: wrap('story:evening', runEveningStoryJob) },
    { name: 'daily-report', hhmm: schedule.dailyReport, run: wrap('daily-report', runDailyReportJob) },
  ];

  for (const job of jobs) {
    job.task = cron.schedule(cronExpr(job.hhmm), job.run, { timezone: BUSINESS_TZ });
  }
  started = true;
  logger.info('scheduler started', { tz: BUSINESS_TZ, schedule, now: formatMsk() });
}

/** Re-read schedule from settings and re-arm cron jobs. */
export function restartScheduler(): void {
  stopScheduler();
  startScheduler();
}

function wrap(name: string, fn: () => Promise<unknown>): () => Promise<void> {
  return async () => {
    lastRun[name] = formatMsk();
    logger.info('job triggered', { job: name, at: lastRun[name] });
    try {
      await fn();
    } catch (err) {
      logger.error('job crashed', { job: name, error: err instanceof Error ? err.message : String(err) });
    }
  };
}

export function stopScheduler(): void {
  for (const job of jobs) job.task?.stop();
  jobs = [];
  started = false;
}

export function schedulerStatus() {
  return {
    running: started,
    enabled: env.server.schedulerEnabled,
    tz: BUSINESS_TZ,
    now: formatMsk(nowMsk()),
    schedule: getSettings().schedule,
    lastRun,
    jobs: jobs.map((j) => ({ name: j.name, at: j.hhmm })),
  };
}
