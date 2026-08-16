import { storage } from '../store/backend.js';
import { logger } from './logger.js';

/**
 * Job lock to prevent duplicate scheduled runs, backed by the storage layer
 * (Redis SETNX on Vercel, serialized file mutate locally). Keys per spec §29:
 *   story:{date}:{period}:{staffId}
 *   daily-report:{date}
 */
export function storyLockKey(date: string, period: string, staffId: number): string {
  return `story:${date}:${period}:${staffId}`;
}

export function dailyReportLockKey(date: string): string {
  return `daily-report:${date}`;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type LockResult<T> = { skipped: true } | { skipped: false; value: T };

export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<LockResult<T>> {
  const owner = await storage().acquireLock(key, ttlMs);
  if (!owner) {
    logger.warn('lock busy, skipping run', { key });
    return { skipped: true };
  }
  try {
    const value = await fn();
    return { skipped: false, value };
  } finally {
    await storage().releaseLock(key, owner);
  }
}
