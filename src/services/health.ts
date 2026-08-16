import {
  safeConfigSnapshot,
  telegramBusinessConfigured,
  telegramConfigured,
  yclientsConfigured,
} from '../config/settings.js';
import { storage } from '../store/backend.js';
import { telegramService } from './telegram/service.js';
import { schedulerStatus } from './scheduler/scheduler.js';

async function getMeta(key: string): Promise<string | null> {
  return storage().getRaw(`meta:${key}`);
}

/**
 * Safe integration health. Never returns secrets — presence booleans and
 * high-level statuses only (spec §30).
 */
export type IntegrationsHealth = {
  yclients: boolean;
  telegram: boolean;
  telegramBusiness: boolean;
  scheduler: boolean;
};

/** Minimal boolean health for /api/admin/integrations/health. */
export async function integrationsHealth(): Promise<IntegrationsHealth> {
  const business = await telegramService().checkBusinessConnection();
  return {
    yclients: yclientsConfigured(),
    telegram: telegramConfigured(),
    telegramBusiness: business.configured && business.connected && business.canManageStories,
    // On Vercel the scheduler is Vercel Cron (no in-process node-cron).
    scheduler: schedulerStatus().running || Boolean(process.env.VERCEL),
  };
}

/** Richer dashboard status (spec §26). Still no secrets. */
export async function dashboardStatus() {
  const business = await telegramService().checkBusinessConnection();
  const sched = schedulerStatus();

  return {
    config: safeConfigSnapshot(),
    integrations: {
      yclients: yclientsConfigured() ? 'OK' : 'NOT CONFIGURED',
      telegramBot: telegramConfigured() ? 'OK' : 'NOT CONFIGURED',
      businessConnection: business.configured
        ? business.connected
          ? 'OK'
          : 'UNAVAILABLE'
        : 'NOT CONFIGURED',
      storiesPermission: telegramBusinessConfigured()
        ? business.canManageStories
          ? 'OK'
          : 'NO'
        : 'NOT CONFIGURED',
      scheduler: sched.running ? 'RUNNING' : process.env.VERCEL ? 'VERCEL CRON' : sched.enabled ? 'STOPPED' : 'DISABLED',
    },
    scheduler: sched,
    lastYclientsSync: await getMeta('lastYclientsSync'),
    lastStoryPublish: await getMeta('lastStoryPublish'),
    lastDailyReport: await getMeta('lastDailyReport'),
  };
}
