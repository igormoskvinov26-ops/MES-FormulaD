import { activeBarbers } from '../../config/barbers.js';
import { dailyReportLockKey, storyLockKey, withLock } from '../../lib/lock.js';
import { logger } from '../../lib/logger.js';
import { todayMsk } from '../../lib/time.js';
import { publishStory, type PublishResult } from '../stories/index.js';
import { sendDailyReport } from '../reporting/index.js';

/**
 * Jobs are thin: acquire lock → gather → validate → publish/dry-run → persist →
 * release. Business logic lives in the services, not here (spec §39).
 *
 * In TEST mode every publish is forced to the TEST contour by TelegramService.
 */

export type StoryPeriod = 'morning' | 'day' | 'evening';

export async function runStoryJob(period: StoryPeriod, date = todayMsk()): Promise<Record<string, PublishResult | 'skipped_locked'>> {
  const results: Record<string, PublishResult | 'skipped_locked'> = {};
  const barbers = activeBarbers();
  if (barbers.length === 0) {
    logger.warn('story job: no active barbers configured', { period });
  }
  for (const barber of barbers) {
    const key = storyLockKey(date, period, barber.yclientsStaffId);
    const locked = await withLock(key, async () => {
      try {
        return await publishStory(barber, date, { period });
      } catch (err) {
        logger.error('story job failed for barber', {
          period,
          master: barber.slug,
          error: err instanceof Error ? err.message : String(err),
        });
        return { status: 'failed', reason: err instanceof Error ? err.message : String(err) } as PublishResult;
      }
    });
    results[barber.slug] = locked.skipped ? 'skipped_locked' : locked.value;
  }
  logger.info('story job complete', { period, date, results: summarize(results) });
  return results;
}

export const runMorningStoryJob = () => runStoryJob('morning');
export const runDayStoryJob = () => runStoryJob('day');
export const runEveningStoryJob = () => runStoryJob('evening');

export async function runDailyReportJob(date = todayMsk()) {
  const key = dailyReportLockKey(date);
  const locked = await withLock(key, async () => {
    try {
      return await sendDailyReport(date, 'test');
    } catch (err) {
      logger.error('daily report job failed', {
        date,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  });
  if (locked.skipped) {
    logger.warn('daily report job skipped (locked)', { date });
    return { skipped: true } as const;
  }
  logger.info('daily report job complete', { date });
  return { skipped: false, ...locked.value } as const;
}

function summarize(results: Record<string, PublishResult | 'skipped_locked'>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(results)) {
    out[k] = typeof v === 'string' ? v : v.status;
  }
  return out;
}
