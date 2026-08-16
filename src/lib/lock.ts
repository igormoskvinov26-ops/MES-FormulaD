import { randomUUID } from 'node:crypto';
import { mutate } from '../store/db.js';
import { logger } from './logger.js';

/**
 * Database-backed job lock to prevent duplicate scheduled runs.
 *
 * Lock keys per the spec:
 *   story:{date}:{period}:{staffId}
 *   daily-report:{date}
 *
 * `withLock` acquires, runs, and releases. If the lock is held, the callback is
 * skipped (returns { skipped: true }) — never run twice concurrently.
 */
export function storyLockKey(date: string, period: string, staffId: number): string {
  return `story:${date}:${period}:${staffId}`;
}

export function dailyReportLockKey(date: string): string {
  return `daily-report:${date}`;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function tryAcquire(key: string, ttlMs: number): Promise<string | null> {
  const owner = randomUUID();
  const now = Date.now();
  return mutate((db) => {
    const existing = db.locks[key];
    if (existing && existing.expiresAt > now) {
      return null; // still held
    }
    db.locks[key] = { acquiredAt: now, expiresAt: now + ttlMs, owner };
    return owner;
  });
}

async function release(key: string, owner: string): Promise<void> {
  await mutate((db) => {
    const existing = db.locks[key];
    if (existing && existing.owner === owner) {
      delete db.locks[key];
    }
  });
}

export type LockResult<T> = { skipped: true } | { skipped: false; value: T };

export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<LockResult<T>> {
  const owner = await tryAcquire(key, ttlMs);
  if (!owner) {
    logger.warn('lock busy, skipping run', { key });
    return { skipped: true };
  }
  try {
    const value = await fn();
    return { skipped: false, value };
  } finally {
    await release(key, owner);
  }
}
