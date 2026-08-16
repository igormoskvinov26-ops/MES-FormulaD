import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * getAvailableSlots must drop past / non-bookable / after-shift slots (spec §5).
 * Uses a fixed system time and a mocked fetch.
 */
async function loadYclients() {
  vi.resetModules();
  process.env.YCLIENTS_PARTNER_TOKEN = 'p';
  process.env.YCLIENTS_USER_TOKEN = 'u';
  process.env.YCLIENTS_COMPANY_ID = '123';
  return import('./index.js');
}

function mockBookTimes(rows: Array<Record<string, unknown>>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, data: rows }),
    })) as unknown as typeof fetch,
  );
}

describe('getAvailableSlots filtering', () => {
  beforeEach(() => {
    // 2026-08-16 12:00 Europe/Moscow == 09:00 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T09:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('drops past slots, keeps future bookable ones', async () => {
    mockBookTimes([
      { time: '09:00' },
      { time: '13:30' },
      { time: '16:00' },
    ]);
    const { getAvailableSlots } = await loadYclients();
    const slots = await getAvailableSlots(101, '2026-08-16');
    expect(slots.map((s) => s.time)).toEqual(['13:30', '16:00']);
  });

  it('drops non-bookable and after-shift slots', async () => {
    mockBookTimes([
      { time: '13:30', is_bookable: true },
      { time: '15:00', is_bookable: false },
      { time: '21:00', is_bookable: true },
    ]);
    const { getAvailableSlots } = await loadYclients();
    const slots = await getAvailableSlots(101, '2026-08-16', '19:00');
    expect(slots.map((s) => s.time)).toEqual(['13:30']);
  });

  it('returns [] when the API call fails (non-fatal for a single barber)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch);
    const { getAvailableSlots } = await loadYclients();
    const p = getAvailableSlots(101, '2026-08-16');
    // flush the bounded retry backoff (setTimeout) under fake timers
    await vi.runAllTimersAsync();
    const slots = await p;
    expect(slots).toEqual([]);
  });
});
