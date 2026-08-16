import { logger } from '../../lib/logger.js';
import { setMeta } from '../../store/backend.js';
import { isValidBusinessDate } from '../../lib/time.js';
import { AppError } from '../../lib/errors.js';
import { telegramService } from '../telegram/service.js';
import type { SendTarget } from '../telegram/types.js';
import { formatDailyReport } from './format.js';
import { buildDailyReport, type DailyReport } from './report.js';

export { buildDailyReport, formatDailyReport };
export type { DailyReport };

/** Build + format a report without sending (preview). */
export async function previewDailyReport(date: string): Promise<{ report: DailyReport; text: string }> {
  if (!isValidBusinessDate(date)) throw new AppError('INVALID_DATE', 'Invalid date');
  const report = await buildDailyReport(date);
  return { report, text: formatDailyReport(report) };
}

/** Build, format and send the daily report to the service Telegram group. */
export async function sendDailyReport(date: string, target: SendTarget = 'test') {
  if (!isValidBusinessDate(date)) throw new AppError('INVALID_DATE', 'Invalid date');
  const report = await buildDailyReport(date);
  const text = formatDailyReport(report);
  const res = await telegramService().sendMessage(text, { target });
  logger.action({
    job: 'daily-report',
    result: res.status ?? 'sent',
    telegramDestination: res.destination,
    telegramMessageId: res.messageId,
  });
  if (!res.dryRun) await setMeta('lastDailyReport', new Date().toISOString());
  return { report, text, send: res };
}
