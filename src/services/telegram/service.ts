import {
  env,
  isDryRun,
  isTestMode,
  telegramBusinessConfigured,
  telegramConfigured,
} from '../../config/env.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { withRetry } from '../../lib/retry.js';
import type {
  BusinessConnectionStatus,
  SendTarget,
  StoryArea,
  TelegramSendResult,
} from './types.js';

const API_ROOT = 'https://api.telegram.org';

/**
 * Single Telegram integration layer. All Telegram API access goes through this
 * class so the API is never scattered across controllers.
 *
 * TEST-mode safety (spec §31): while TELEGRAM_MODE=test, every send is forced to
 * the TEST chat, and any request that targets `production` throws
 * "Production publishing disabled in TEST mode." — the production destination is
 * technically unreachable.
 *
 * DRY-RUN (spec §32): when TELEGRAM_DRY_RUN=true, payloads are built and
 * validated but nothing is physically sent.
 */
export class TelegramService {
  private get token(): string {
    return env.telegram.botToken;
  }

  /**
   * Resolve the concrete chat id for a logical target, enforcing TEST mode.
   * Throws in TEST mode if production is requested.
   */
  resolveChatId(target: SendTarget): string {
    if (target === 'production') {
      if (isTestMode()) {
        // Production destination is unreachable in TEST mode.
        throw Errors.productionDisabledInTestMode();
      }
      if (!env.telegram.productionChatId) {
        throw new Error('TELEGRAM_PRODUCTION_CHAT_ID is not configured');
      }
      return env.telegram.productionChatId;
    }
    // target === 'test'
    if (!env.telegram.testChatId) {
      throw new Error('TELEGRAM_TEST_CHAT_ID is not configured');
    }
    return env.telegram.testChatId;
  }

  private async call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
    if (!this.token) throw Errors.telegramUnavailable(new Error('bot token missing'));
    const url = `${API_ROOT}/bot${this.token}/${method}`;
    return withRetry(
      async () => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
        if (!json.ok) {
          logger.warn('telegram api error', { method, description: json.description });
          throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
        }
        return json.result as T;
      },
      { label: `telegram ${method}`, retries: 1, delaysMs: [5000, 30000] },
    );
  }

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------
  async sendMessage(
    text: string,
    opts: { target?: SendTarget } = {},
  ): Promise<TelegramSendResult> {
    const target = opts.target ?? 'test';
    const chatId = this.resolveChatId(target);
    const destination = maskChatId(chatId);

    if (isDryRun()) {
      logger.action({ job: 'sendMessage', result: 'dry_run', telegramDestination: destination });
      return { ok: true, dryRun: true, destination, status: 'dry_run' };
    }
    const result = await this.call<{ message_id: number }>('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    logger.action({
      job: 'sendMessage',
      result: 'sent',
      telegramDestination: destination,
      telegramMessageId: result.message_id,
    });
    return { ok: true, dryRun: false, destination, messageId: result.message_id, status: 'sent' };
  }

  async sendPhoto(
    photo: Buffer,
    opts: { target?: SendTarget; caption?: string } = {},
  ): Promise<TelegramSendResult> {
    const target = opts.target ?? 'test';
    const chatId = this.resolveChatId(target);
    const destination = maskChatId(chatId);

    if (isDryRun()) {
      logger.action({ job: 'sendPhoto', result: 'dry_run', telegramDestination: destination });
      return { ok: true, dryRun: true, destination, status: 'dry_run' };
    }
    const form = new FormData();
    form.set('chat_id', chatId);
    if (opts.caption) form.set('caption', opts.caption);
    form.set('photo', new Blob([new Uint8Array(photo)], { type: 'image/png' }), 'story.png');
    const res = await fetch(`${API_ROOT}/bot${this.token}/sendPhoto`, { method: 'POST', body: form });
    const json = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
    if (!json.ok) throw Errors.telegramUnavailable(new Error(json.description));
    logger.action({
      job: 'sendPhoto',
      result: 'sent',
      telegramDestination: destination,
      telegramMessageId: json.result?.message_id,
    });
    return {
      ok: true,
      dryRun: false,
      destination,
      messageId: json.result?.message_id,
      status: 'sent',
    };
  }

  // -------------------------------------------------------------------------
  // Business connection / Stories
  // -------------------------------------------------------------------------
  async checkBusinessConnection(): Promise<BusinessConnectionStatus> {
    if (!telegramBusinessConfigured()) {
      return {
        configured: false,
        connected: false,
        canManageStories: false,
        note: 'Telegram Stories not configured',
      };
    }
    try {
      const conn = await this.call<{
        is_enabled?: boolean;
        rights?: { can_manage_stories?: boolean };
        can_reply?: boolean;
      }>('getBusinessConnection', {
        business_connection_id: env.telegram.businessConnectionId,
      });
      const canManageStories = Boolean(conn.rights?.can_manage_stories);
      return {
        configured: true,
        connected: Boolean(conn.is_enabled ?? true),
        canManageStories,
        note: canManageStories ? 'OK' : 'Story permission missing',
      };
    } catch (err) {
      logger.warn('business connection check failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        configured: true,
        connected: false,
        canManageStories: false,
        note: 'Business connection unavailable',
      };
    }
  }

  /**
   * Publish a Telegram Business Story with a clickable link area over the CTA.
   * Returns a clear status (not an exception) when Stories aren't configured.
   */
  async postStory(input: {
    photo: Buffer;
    areas: StoryArea[];
    activePeriod?: number; // seconds; default 6h
    target?: SendTarget;
    caption?: string;
  }): Promise<TelegramSendResult> {
    const target = input.target ?? 'test';
    // Enforce TEST-mode guard even for stories.
    if (target === 'production' && isTestMode()) throw Errors.productionDisabledInTestMode();

    const status = await this.checkBusinessConnection();
    if (!status.configured) {
      return {
        ok: false,
        dryRun: isDryRun(),
        destination: 'business',
        status: 'telegram_stories_not_configured',
      };
    }
    if (!status.canManageStories) {
      throw Errors.telegramStoryPermissionMissing();
    }

    if (isDryRun()) {
      logger.action({ job: 'postStory', result: 'dry_run', telegramDestination: 'business' });
      return { ok: true, dryRun: true, destination: 'business', status: 'dry_run' };
    }

    const form = new FormData();
    form.set('business_connection_id', env.telegram.businessConnectionId);
    form.set(
      'content',
      JSON.stringify({ type: 'photo', photo: 'attach://story.png' }),
    );
    form.set('active_period', String(input.activePeriod ?? 6 * 3600));
    if (input.areas.length) form.set('areas', JSON.stringify(input.areas));
    if (input.caption) form.set('caption', input.caption);
    form.set('story.png', new Blob([new Uint8Array(input.photo)], { type: 'image/png' }), 'story.png');

    const res = await fetch(`${API_ROOT}/bot${this.token}/postStory`, { method: 'POST', body: form });
    const json = (await res.json()) as { ok: boolean; result?: { id: number }; description?: string };
    if (!json.ok) throw Errors.telegramUnavailable(new Error(json.description));
    logger.action({
      job: 'postStory',
      result: 'sent',
      telegramDestination: 'business',
      telegramStoryId: json.result?.id,
    });
    return { ok: true, dryRun: false, destination: 'business', storyId: json.result?.id, status: 'sent' };
  }

  async editStory(input: {
    storyId: number;
    photo: Buffer;
    areas: StoryArea[];
    caption?: string;
    target?: SendTarget;
  }): Promise<TelegramSendResult> {
    const target = input.target ?? 'test';
    if (target === 'production' && isTestMode()) throw Errors.productionDisabledInTestMode();

    const status = await this.checkBusinessConnection();
    if (!status.configured) {
      return { ok: false, dryRun: isDryRun(), destination: 'business', status: 'telegram_stories_not_configured' };
    }
    if (!status.canManageStories) throw Errors.telegramStoryPermissionMissing();

    if (isDryRun()) {
      logger.action({ job: 'editStory', result: 'dry_run', telegramStoryId: input.storyId });
      return { ok: true, dryRun: true, destination: 'business', status: 'dry_run' };
    }

    const form = new FormData();
    form.set('business_connection_id', env.telegram.businessConnectionId);
    form.set('story_id', String(input.storyId));
    form.set('content', JSON.stringify({ type: 'photo', photo: 'attach://story.png' }));
    if (input.areas.length) form.set('areas', JSON.stringify(input.areas));
    if (input.caption) form.set('caption', input.caption);
    form.set('story.png', new Blob([new Uint8Array(input.photo)], { type: 'image/png' }), 'story.png');

    const res = await fetch(`${API_ROOT}/bot${this.token}/editStory`, { method: 'POST', body: form });
    const json = (await res.json()) as { ok: boolean; result?: { id: number }; description?: string };
    if (!json.ok) throw Errors.telegramUnavailable(new Error(json.description));
    logger.action({ job: 'editStory', result: 'sent', telegramStoryId: json.result?.id ?? input.storyId });
    return {
      ok: true,
      dryRun: false,
      destination: 'business',
      storyId: json.result?.id ?? input.storyId,
      status: 'sent',
    };
  }

  async deleteStory(storyId: number, opts: { target?: SendTarget } = {}): Promise<TelegramSendResult> {
    const target = opts.target ?? 'test';
    if (target === 'production' && isTestMode()) throw Errors.productionDisabledInTestMode();
    if (!telegramBusinessConfigured()) {
      return { ok: false, dryRun: isDryRun(), destination: 'business', status: 'telegram_stories_not_configured' };
    }
    if (isDryRun()) {
      logger.action({ job: 'deleteStory', result: 'dry_run', telegramStoryId: storyId });
      return { ok: true, dryRun: true, destination: 'business', status: 'dry_run' };
    }
    await this.call('deleteStory', {
      business_connection_id: env.telegram.businessConnectionId,
      story_id: storyId,
    });
    logger.action({ job: 'deleteStory', result: 'sent', telegramStoryId: storyId });
    return { ok: true, dryRun: false, destination: 'business', storyId, status: 'sent' };
  }

  get isConfigured(): boolean {
    return telegramConfigured();
  }
}

/** Mask a chat id for logs/results (keep last 3 chars only). */
function maskChatId(chatId: string): string {
  if (chatId.length <= 4) return '***';
  return `***${chatId.slice(-3)}`;
}

let singleton: TelegramService | null = null;
export function telegramService(): TelegramService {
  if (!singleton) singleton = new TelegramService();
  return singleton;
}
