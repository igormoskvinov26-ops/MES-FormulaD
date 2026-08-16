import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Job-lock prevents duplicate scheduled runs (spec §29). Each test uses a fresh
 * DATA_DIR so the file-backed store starts empty.
 */
async function loadLock() {
  vi.resetModules();
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'rubl-lock-'));
  return import('./lock.js');
}

afterEach(() => {
  delete process.env.DATA_DIR;
});

describe('withLock (distributed/db job lock)', () => {
  it('builds the documented lock keys', async () => {
    const { storyLockKey, dailyReportLockKey } = await loadLock();
    expect(storyLockKey('2026-08-16', 'morning', 101)).toBe('story:2026-08-16:morning:101');
    expect(dailyReportLockKey('2026-08-16')).toBe('daily-report:2026-08-16');
  });

  it('a second concurrent run on the same key is skipped, not executed twice', async () => {
    const { withLock } = await loadLock();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));

    const runs = { first: 0, second: 0 };
    const p1 = withLock('story:2026-08-16:morning:101', async () => {
      runs.first += 1;
      await gate; // hold the lock
      return 'a';
    });
    // p1 acquires first (mutate is serialized); p2 must see it held.
    const p2 = withLock('story:2026-08-16:morning:101', async () => {
      runs.second += 1;
      return 'b';
    });

    const r2 = await p2;
    expect(r2).toEqual({ skipped: true });
    expect(runs.second).toBe(0); // callback never ran

    release();
    const r1 = await p1;
    expect(r1).toEqual({ skipped: false, value: 'a' });
    expect(runs.first).toBe(1);
  });

  it('the lock is released after completion so the next run can acquire it', async () => {
    const { withLock } = await loadLock();
    const a = await withLock('daily-report:2026-08-16', async () => 1);
    const b = await withLock('daily-report:2026-08-16', async () => 2);
    expect(a).toEqual({ skipped: false, value: 1 });
    expect(b).toEqual({ skipped: false, value: 2 });
  });
});
