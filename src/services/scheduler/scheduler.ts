import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { formatMsk, nowMsk, parseHHmm } from '../../lib/time.js';
import { runDailyReportJob, runDayStoryJob, runEveningStoryJob, runMorningStoryJob } from './jobs.js';

/**
 * Cron scheduler running in Europe/Moscow. Times come from env (HH:mm). The
 * scheduler only triggers jobs — it holds no business logic.
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

  jobs = [
    { name: 'story:morning', hhmm: env.schedule.morning, run: wrap('story:morning', runMorningStoryJob) },
    { name: 'story:day', hhmm: env.schedule.day, run: wrap('story:day', runDayStoryJob) },
    { name: 'story:evening', hhmm: env.schedule.evening, run: wrap('story:evening', runEveningStoryJob) },
    { name: 'daily-report', hhmm: env.schedule.dailyReport, run: wrap('daily-report', runDailyReportJob) },
  ];

  for (const job of jobs) {
    job.task = cron.schedule(cronExpr(job.hhmm), job.run, {
      timezone: env.tz,
    });
  }
  started = true;
  logger.info('scheduler started', {
    tz: env.tz,
    schedule: env.schedule,
    now: formatMsk(),
  });
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
    tz: env.tz,
    now: formatMsk(nowMsk()),
    schedule: env.schedule,
    lastRun,
    jobs: jobs.map((j) => ({ name: j.name, at: j.hhmm })),
  };
}
