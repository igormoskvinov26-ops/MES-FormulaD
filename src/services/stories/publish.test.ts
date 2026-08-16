import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Story publish flow — spec §45 (Story) edge cases, with YCLIENTS / Telegram /
 * renderer mocked. Each test resets modules and uses a fresh store dir.
 */

type WorkingStaff = {
  staffId: number;
  displayName: string;
  worksToday: boolean;
  shiftStart: string | null;
  shiftEnd: string | null;
};

const yclients = {
  getWorkingStaff: vi.fn<[], Promise<WorkingStaff[]>>(),
  getAvailableSlots: vi.fn(),
};

const tg = {
  postStory: vi.fn(),
  editStory: vi.fn(),
  sendPhoto: vi.fn(),
  deleteStory: vi.fn(),
  checkBusinessConnection: vi.fn(),
};

const renderer = {
  renderStoryPng: vi.fn(async () => Buffer.from('PNGDATA')),
  closeRenderer: vi.fn(async () => {}),
};

async function load() {
  vi.resetModules();
  process.env.TELEGRAM_MODE = 'test';
  process.env.TELEGRAM_DRY_RUN = 'false';
  process.env.BARBER_ARTASH_STAFF_ID = '101';
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'rubl-story-'));

  vi.doMock('../yclients/index.js', () => yclients);
  vi.doMock('../telegram/service.js', () => ({ telegramService: () => tg }));
  vi.doMock('./renderer.js', () => renderer);

  const storiesMod = await import('./index.js');
  const { barberBySlug } = await import('../../config/barbers.js');
  const { todayMsk } = await import('../../lib/time.js');
  return { ...storiesMod, barber: barberBySlug('artash')!, date: todayMsk() };
}

function working(shiftEnd = '20:00'): WorkingStaff[] {
  return [{ staffId: 101, displayName: 'Арташ', worksToday: true, shiftStart: '10:00', shiftEnd }];
}

beforeEach(() => {
  vi.clearAllMocks();
  tg.postStory.mockResolvedValue({ ok: true, dryRun: false, destination: 'business', storyId: 555, status: 'sent' });
  tg.editStory.mockResolvedValue({ ok: true, dryRun: false, destination: 'business', storyId: 555, status: 'sent' });
  renderer.renderStoryPng.mockResolvedValue(Buffer.from('PNGDATA'));
});

afterEach(() => {
  vi.doUnmock('../yclients/index.js');
  vi.doUnmock('../telegram/service.js');
  vi.doUnmock('./renderer.js');
});

describe('publishStory — §45 Story edge cases', () => {
  it('master not working today → skipped, nothing published', async () => {
    const { publishStory, barber, date } = await load();
    yclients.getWorkingStaff.mockResolvedValue([]); // nobody working
    const res = await publishStory(barber, date, { period: 'morning' });
    expect(res.status).toBe('skipped');
    expect(res.reason).toBe('not working today');
    expect(tg.postStory).not.toHaveBeenCalled();
  });

  it('working but 0 free windows → no Story created', async () => {
    const { publishStory, barber, date } = await load();
    yclients.getWorkingStaff.mockResolvedValue(working());
    yclients.getAvailableSlots.mockResolvedValue([]);
    const res = await publishStory(barber, date, { period: 'morning' });
    expect(res.status).toBe('skipped');
    expect(res.reason).toBe('no available slots');
    expect(tg.postStory).not.toHaveBeenCalled();
  });

  it('1 free window → renders and posts a Story', async () => {
    const { publishStory, barber, date } = await load();
    yclients.getWorkingStaff.mockResolvedValue(working());
    yclients.getAvailableSlots.mockResolvedValue([{ time: '13:30', bookable: true }]);
    const res = await publishStory(barber, date, { period: 'morning' });
    expect(res.status).toBe('published');
    expect(res.storyId).toBe(555);
    expect(renderer.renderStoryPng).toHaveBeenCalledOnce();
    expect(tg.postStory).toHaveBeenCalledOnce();
  });

  it('slot disappears at publish time → re-check skips, no stale publish', async () => {
    const { publishStory, barber, date } = await load();
    yclients.getWorkingStaff.mockResolvedValue(working());
    // the immediate pre-publish re-check returns no slots
    yclients.getAvailableSlots.mockResolvedValue([]);
    const res = await publishStory(barber, date, { period: 'day' });
    expect(res.status).toBe('skipped');
    expect(tg.postStory).not.toHaveBeenCalled();
  });

  it('unchanged slots since last publish → deduped (no duplicate)', async () => {
    const { publishStory, barber, date } = await load();
    yclients.getWorkingStaff.mockResolvedValue(working());
    yclients.getAvailableSlots.mockResolvedValue([{ time: '13:30', bookable: true }]);
    const first = await publishStory(barber, date, { period: 'morning' });
    expect(first.status).toBe('published');
    const second = await publishStory(barber, date, { period: 'day' });
    expect(second.status).toBe('skipped');
    expect(second.reason).toBe('no change');
    expect(tg.postStory).toHaveBeenCalledOnce(); // not called again
  });

  it('changed slots after a publish → updates existing Story (edit)', async () => {
    const { publishStory, barber, date } = await load();
    yclients.getWorkingStaff.mockResolvedValue(working());
    yclients.getAvailableSlots.mockResolvedValueOnce([{ time: '13:30', bookable: true }]);
    await publishStory(barber, date, { period: 'morning' });
    yclients.getAvailableSlots.mockResolvedValue([{ time: '16:00', bookable: true }]);
    const res = await publishStory(barber, date, { period: 'day' });
    expect(res.status).toBe('updated');
    expect(tg.editStory).toHaveBeenCalledOnce();
    expect(tg.postStory).toHaveBeenCalledOnce(); // only the initial post
  });

  it('Telegram unavailable → failure recorded and error propagated', async () => {
    const { publishStory, barber, date } = await load();
    yclients.getWorkingStaff.mockResolvedValue(working());
    yclients.getAvailableSlots.mockResolvedValue([{ time: '13:30', bookable: true }]);
    tg.postStory.mockRejectedValue(new Error('Telegram API unavailable'));
    await expect(publishStory(barber, date, { period: 'morning' })).rejects.toThrow(
      'Telegram API unavailable',
    );
  });

  it('renderer failure → surfaced as Story rendering failed', async () => {
    const { publishStory, barber, date } = await load();
    yclients.getWorkingStaff.mockResolvedValue(working());
    yclients.getAvailableSlots.mockResolvedValue([{ time: '13:30', bookable: true }]);
    // the real renderer wraps low-level failures as "Story rendering failed"
    renderer.renderStoryPng.mockRejectedValue(new Error('Story rendering failed'));
    await expect(publishStory(barber, date, { period: 'morning' })).rejects.toThrow(
      'Story rendering failed',
    );
    expect(tg.postStory).not.toHaveBeenCalled();
  });

  it('Telegram Stories not configured → clear status, optional photo fallback', async () => {
    const { publishStory, barber, date } = await load();
    yclients.getWorkingStaff.mockResolvedValue(working());
    yclients.getAvailableSlots.mockResolvedValue([{ time: '13:30', bookable: true }]);
    tg.postStory.mockResolvedValue({
      ok: false,
      dryRun: false,
      destination: 'business',
      status: 'telegram_stories_not_configured',
    });
    tg.sendPhoto.mockResolvedValue({ ok: true, dryRun: false, destination: '***111', status: 'sent' });
    const res = await publishStory(barber, date, { period: 'manual', photoFallback: true });
    expect(res.status).toBe('telegram_stories_not_configured');
    expect(tg.sendPhoto).toHaveBeenCalledOnce();
  });

  it('rejects publishing for a non-today date (stale)', async () => {
    const { publishStory, barber } = await load();
    await expect(publishStory(barber, '2000-01-01', { period: 'morning' })).rejects.toThrow(
      'Story date must be today',
    );
  });
});
