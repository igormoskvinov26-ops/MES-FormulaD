import {
  safeConfigSnapshot,
  telegramBusinessConfigured,
  telegramConfigured,
  yclientsConfigured,
} from '../config/env.js';
import { read } from '../store/db.js';
import { telegramService } from './telegram/service.js';
import { schedulerStatus } from './scheduler/scheduler.js';

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
    scheduler: schedulerStatus().running,
  };
}

/** Richer dashboard status (spec §26). Still no secrets. */
export async function dashboardStatus() {
  const business = await telegramService().checkBusinessConnection();
  const sched = schedulerStatus();
  const meta = await read((db) => db.meta as Record<string, unknown>);

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
      scheduler: sched.running ? 'RUNNING' : sched.enabled ? 'STOPPED' : 'DISABLED',
    },
    scheduler: sched,
    lastYclientsSync: (meta.lastYclientsSync as string) ?? null,
    lastStoryPublish: (meta.lastStoryPublish as string) ?? null,
    lastDailyReport: (meta.lastDailyReport as string) ?? null,
  };
}
