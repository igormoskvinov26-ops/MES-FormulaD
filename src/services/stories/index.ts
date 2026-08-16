import type { BarberConfig } from '../../config/barbers.js';
import { templateForBarber } from '../../config/templates.js';
import { isDryRun } from '../../config/settings.js';
import { AppError, Errors } from '../../lib/errors.js';
import { slotFingerprint } from '../../lib/fingerprint.js';
import { logger } from '../../lib/logger.js';
import { isToday, isValidBusinessDate, reportDateLabel } from '../../lib/time.js';
import { getAvailableSlots, getWorkingStaff } from '../yclients/index.js';
import { telegramService } from '../telegram/service.js';
import type { SendTarget } from '../telegram/types.js';
import { buildCtaStoryAreas } from './areas.js';
import { renderStoryPng } from './renderer.js';
import { getStoryState, saveStoryState, type StoryState } from './state.js';

export type StoryPlan = {
  barber: BarberConfig;
  date: string;
  worksToday: boolean;
  shiftStart: string | null;
  shiftEnd: string | null;
  slots: string[];
  fingerprint: string;
  /** whether a Story should be produced (works today AND has >=1 slot). */
  shouldPublish: boolean;
  reason?: string;
};

/**
 * Build the current Story plan for a barber on a date. Determines working
 * status from the schedule (source of truth) and gathers real, future,
 * bookable slots.
 */
export async function buildStoryPlan(barber: BarberConfig, date: string): Promise<StoryPlan> {
  if (!isValidBusinessDate(date)) throw new AppError('INVALID_DATE', 'Invalid date');

  const working = await getWorkingStaff(date);
  const mine = working.find((s) => s.staffId === barber.yclientsStaffId);
  if (!mine) {
    return {
      barber,
      date,
      worksToday: false,
      shiftStart: null,
      shiftEnd: null,
      slots: [],
      fingerprint: slotFingerprint({ staffId: barber.yclientsStaffId, date, slots: [] }),
      shouldPublish: false,
      reason: 'not working today',
    };
  }

  const freeSlots = await getAvailableSlots(barber.yclientsStaffId, date, mine.shiftEnd);
  const slots = freeSlots.map((s) => s.time);
  const fingerprint = slotFingerprint({ staffId: barber.yclientsStaffId, date, slots });

  return {
    barber,
    date,
    worksToday: true,
    shiftStart: mine.shiftStart,
    shiftEnd: mine.shiftEnd,
    slots,
    fingerprint,
    shouldPublish: slots.length >= 1,
    reason: slots.length === 0 ? 'no available slots' : undefined,
  };
}

/**
 * Render the exact PNG that will be sent to Telegram (used for both preview and
 * publish, guaranteeing preview === published, spec §41).
 */
export async function renderStoryForPlan(plan: StoryPlan): Promise<Buffer> {
  const template = templateForBarber(plan.barber.slug);
  if (!template) throw Errors.storyRenderingFailed(new Error('template missing'));
  return renderStoryPng({
    template,
    slots: plan.slots,
    dateLabel: reportDateLabel(plan.date),
  });
}

export type PublishOptions = {
  period: string; // morning | day | evening | manual
  target?: SendTarget; // enforced by TelegramService (production blocked in TEST)
  /** When Stories are unavailable, also send the PNG as a photo to test chat. */
  photoFallback?: boolean;
};

export type PublishResult = {
  status: StoryState['status'] | 'telegram_stories_not_configured';
  reason?: string;
  storyId?: number | null;
  fingerprint?: string;
};

/**
 * Publish (or update) a Story for a barber.
 *
 * Safety chain: validate → re-check slots right before publish (spec §5) →
 * fingerprint dedup (spec §14) → render → edit existing or post new →
 * persist state. Never publishes stale slots.
 */
export async function publishStory(
  barber: BarberConfig,
  date: string,
  opts: PublishOptions,
): Promise<PublishResult> {
  const target = opts.target ?? 'test';

  // ---- validation (spec §33) ----
  if (!isValidBusinessDate(date)) throw new AppError('INVALID_DATE', 'Invalid date');
  if (!isToday(date)) throw new AppError('NOT_TODAY', 'Story date must be today (Europe/Moscow)');
  const template = templateForBarber(barber.slug);
  if (!template) throw Errors.storyRenderingFailed(new Error('template missing'));

  // ---- re-check slots immediately before publishing ----
  const plan = await buildStoryPlan(barber, date);
  if (!plan.worksToday) {
    await recordSkip(barber, date, opts.period, plan.fingerprint, 'not working today');
    return { status: 'skipped', reason: 'not working today' };
  }
  if (!plan.shouldPublish) {
    await recordSkip(barber, date, opts.period, plan.fingerprint, 'no available slots');
    return { status: 'skipped', reason: 'no available slots' };
  }

  // ---- anti-spam: unchanged since last successful publish ----
  const prev = await getStoryState(barber.yclientsStaffId, date);
  const alreadyPublished =
    prev && (prev.status === 'published' || prev.status === 'updated') && prev.telegramStoryId;
  if (prev && prev.slotFingerprint === plan.fingerprint && alreadyPublished) {
    logger.action({
      job: `story:${opts.period}`,
      master: barber.slug,
      result: 'skipped_no_change',
      telegramStoryId: prev.telegramStoryId ?? undefined,
    });
    return { status: 'skipped', reason: 'no change', storyId: prev.telegramStoryId };
  }

  // ---- render exact PNG ----
  const png = await renderStoryForPlan(plan);
  if (!png || png.length === 0) throw Errors.storyRenderingFailed(new Error('empty PNG'));

  const tg = telegramService();
  const areas = buildCtaStoryAreas(template);

  // ---- publish: prefer editing an existing Story when possible (spec §14) ----
  let result;
  try {
    if (alreadyPublished && prev.telegramStoryId) {
      result = await tg.editStory({
        storyId: prev.telegramStoryId,
        photo: png,
        areas,
        target,
      });
    } else {
      result = await tg.postStory({ photo: png, areas, target });
    }
  } catch (err) {
    await recordFailure(barber, date, opts.period, plan, err);
    throw err;
  }

  // ---- Stories not configured → clear status, optional photo fallback ----
  if (result.status === 'telegram_stories_not_configured') {
    let fallbackNote = 'telegram stories not configured';
    if (opts.photoFallback) {
      try {
        await tg.sendPhoto(png, { target, caption: `${barber.displayName}: ${plan.slots.join(', ')}` });
        fallbackNote += ' (sent as photo to test chat)';
      } catch {
        /* ignore fallback errors */
      }
    }
    await saveStoryState({
      staffId: barber.yclientsStaffId,
      date,
      period: opts.period,
      telegramStoryId: null,
      publishedAt: null,
      slotFingerprint: plan.fingerprint,
      slots: plan.slots,
      status: 'skipped',
      error: fallbackNote,
    });
    return { status: 'telegram_stories_not_configured', reason: fallbackNote, fingerprint: plan.fingerprint };
  }

  const status: StoryState['status'] = result.dryRun
    ? 'dry_run'
    : alreadyPublished
      ? 'updated'
      : 'published';

  await saveStoryState({
    staffId: barber.yclientsStaffId,
    date,
    period: opts.period,
    telegramStoryId: result.storyId ?? prev?.telegramStoryId ?? null,
    publishedAt: result.dryRun ? null : new Date().toISOString(),
    slotFingerprint: plan.fingerprint,
    slots: plan.slots,
    status,
  });

  logger.action({
    job: `story:${opts.period}`,
    master: barber.slug,
    sourceData: { slots: plan.slots },
    result: status,
    telegramDestination: result.destination,
    telegramStoryId: result.storyId ?? undefined,
  });

  return { status, storyId: result.storyId ?? null, fingerprint: plan.fingerprint };
}

/** Delete a TEST Story for a barber/date, if one exists. */
export async function deleteTestStory(barber: BarberConfig, date: string): Promise<PublishResult> {
  const prev = await getStoryState(barber.yclientsStaffId, date);
  if (!prev || !prev.telegramStoryId) {
    return { status: 'skipped', reason: 'no story to delete' };
  }
  const tg = telegramService();
  const res = await tg.deleteStory(prev.telegramStoryId, { target: 'test' });
  await saveStoryState({ ...prev, status: 'deleted', telegramStoryId: null });
  return { status: 'deleted', reason: res.status };
}

async function recordSkip(
  barber: BarberConfig,
  date: string,
  period: string,
  fingerprint: string,
  reason: string,
): Promise<void> {
  logger.action({ job: `story:${period}`, master: barber.slug, result: 'skipped', error: reason });
  const prev = await getStoryState(barber.yclientsStaffId, date);
  await saveStoryState({
    staffId: barber.yclientsStaffId,
    date,
    period,
    telegramStoryId: prev?.telegramStoryId ?? null,
    publishedAt: prev?.publishedAt ?? null,
    slotFingerprint: fingerprint,
    slots: [],
    status: 'skipped',
    error: reason,
  });
}

async function recordFailure(
  barber: BarberConfig,
  date: string,
  period: string,
  plan: StoryPlan,
  err: unknown,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  logger.action({ job: `story:${period}`, master: barber.slug, result: 'failed', error: message });
  const prev = await getStoryState(barber.yclientsStaffId, date);
  await saveStoryState({
    staffId: barber.yclientsStaffId,
    date,
    period,
    telegramStoryId: prev?.telegramStoryId ?? null,
    publishedAt: prev?.publishedAt ?? null,
    slotFingerprint: plan.fingerprint,
    slots: plan.slots,
    status: 'failed',
    error: message,
  });
}

export { isDryRun };
