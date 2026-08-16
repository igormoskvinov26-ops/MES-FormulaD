import { todayMsk } from './lib/time.js';
import { runDailyReportJob, runStoryJob, type StoryPeriod } from './services/scheduler/jobs.js';
import { previewDailyReport } from './services/reporting/index.js';
import { closeRenderer } from './services/stories/renderer.js';

/**
 * Debug CLI for the scheduler jobs. Honors TELEGRAM_MODE and TELEGRAM_DRY_RUN,
 * so `TELEGRAM_DRY_RUN=true` performs everything except the physical send.
 *
 *   npm run cli -- story:morning
 *   npm run cli -- story:day
 *   npm run cli -- story:evening
 *   npm run cli -- report [YYYY-MM-DD]
 *   npm run cli -- report:preview [YYYY-MM-DD]
 */
async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const date = arg && /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : todayMsk();

  switch (cmd) {
    case 'story:morning':
    case 'story:day':
    case 'story:evening': {
      const period = cmd.split(':')[1] as StoryPeriod;
      const res = await runStoryJob(period, date);
      console.log(JSON.stringify(res, null, 2));
      break;
    }
    case 'report': {
      const res = await runDailyReportJob(date);
      console.log(JSON.stringify(res, null, 2));
      break;
    }
    case 'report:preview': {
      const res = await previewDailyReport(date);
      console.log(res.text);
      break;
    }
    default:
      console.log('Usage: cli <story:morning|story:day|story:evening|report|report:preview> [YYYY-MM-DD]');
  }
  await closeRenderer();
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  },
);
