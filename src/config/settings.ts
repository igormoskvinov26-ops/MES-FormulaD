import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { env, BUSINESS_TZ } from './env.js';
import { storage, backendKind } from '../store/backend.js';
import { logger } from '../lib/logger.js';

/**
 * Runtime settings store.
 *
 * Unlike env (read once at boot), these are the mutable, operator-editable
 * settings entered through the Settings UI and persisted to disk, encrypted at
 * rest (AES-256-GCM). env values seed the store on first run.
 *
 * Secrets never leave the server: use `getSafeSettings()` for anything shown to
 * the frontend (presence booleans + non-secret fields only).
 *
 * Under Vitest the store runs in-memory (seeded from process.env, never touching
 * disk) so unit tests stay hermetic.
 */

export type TelegramMode = 'test' | 'production';

export type BarberSetting = {
  slug: string;
  displayName: string;
  template: string;
  staffId: number; // 0 = not configured
  enabled: boolean;
};

export type AppSettings = {
  yclients: { partnerToken: string; userToken: string; companyId: string; apiBase: string };
  telegram: {
    botToken: string;
    testChatId: string;
    productionChatId: string;
    businessConnectionId: string;
    mode: TelegramMode;
    dryRun: boolean;
  };
  bookingUrl: string;
  schedule: { morning: string; day: string; evening: string; dailyReport: string };
  barbers: BarberSetting[];
};

const IN_MEMORY = Boolean(process.env.VITEST);
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const KEY_FILE = path.join(DATA_DIR, '.appkey');
const SETTINGS_KEY = 'settings';

const DEFAULT_BARBERS: Array<Omit<BarberSetting, 'staffId' | 'enabled'>> = [
  { slug: 'artash', displayName: 'Арташ', template: 'artash' },
  { slug: 'ksenia', displayName: 'Ксения', template: 'ksenia' },
  { slug: 'dmitriy', displayName: 'Дмитрий', template: 'dmitriy' },
];

function seedFromEnv(): AppSettings {
  const staffIds: Record<string, string> = {
    artash: env.barberStaffIds.artash,
    ksenia: env.barberStaffIds.ksenia,
    dmitriy: env.barberStaffIds.dmitriy,
  };
  return {
    yclients: {
      partnerToken: env.yclients.partnerToken,
      userToken: env.yclients.userToken,
      companyId: env.yclients.companyId,
      apiBase: env.yclients.apiBase,
    },
    telegram: {
      botToken: env.telegram.botToken,
      testChatId: env.telegram.testChatId,
      productionChatId: env.telegram.productionChatId,
      businessConnectionId: env.telegram.businessConnectionId,
      mode: env.telegram.mode,
      dryRun: env.telegram.dryRun,
    },
    bookingUrl: env.bookingUrl,
    schedule: { ...env.schedule },
    barbers: DEFAULT_BARBERS.map((b) => {
      const staffId = Number.parseInt(staffIds[b.slug] ?? '', 10);
      const id = Number.isFinite(staffId) && staffId > 0 ? staffId : 0;
      return { ...b, staffId: id, enabled: id > 0 };
    }),
  };
}

// ---------------------------------------------------------------------------
// Encryption at rest
// ---------------------------------------------------------------------------
// Key selection:
//   APP_MASTER_KEY set      → derive key from it (works on Vercel/KV)
//   else local file backend → generated key file (data/.appkey, 0600)
//   else (KV without master key) → no encryption (KV is access-controlled;
//                                   a warning recommends APP_MASTER_KEY)
function loadKey(): Buffer | null {
  if (process.env.APP_MASTER_KEY) {
    return scryptSync(process.env.APP_MASTER_KEY, 'rubl-telegram-admin', 32);
  }
  if (backendKind() === 'file') {
    mkdirSync(DATA_DIR, { recursive: true });
    if (existsSync(KEY_FILE)) return Buffer.from(readFileSync(KEY_FILE, 'utf8').trim(), 'base64');
    const key = randomBytes(32);
    writeFileSync(KEY_FILE, key.toString('base64'), { mode: 0o600 });
    try {
      chmodSync(KEY_FILE, 0o600);
    } catch {
      /* ignore */
    }
    return key;
  }
  return null;
}

let warnedNoEncryption = false;
function encryptBlob(plain: string): string {
  const key = loadKey();
  if (!key) {
    if (!warnedNoEncryption && !IN_MEMORY) {
      warnedNoEncryption = true;
      logger.warn('settings stored without encryption — set APP_MASTER_KEY to encrypt at rest');
    }
    return plain; // plaintext JSON (access-controlled store)
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: tag.toString('base64'), data: data.toString('base64') });
}

function decryptBlob(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  const env0 = parsed as { v?: number; iv?: string; tag?: string; data?: string };
  if (!env0 || !env0.iv || !env0.tag || !env0.data) return raw; // plaintext JSON
  const key = loadKey();
  if (!key) throw new Error('settings are encrypted but no key is available (set APP_MASTER_KEY)');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(env0.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(env0.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(env0.data, 'base64')), decipher.final()]).toString('utf8');
}

// ---------------------------------------------------------------------------
// Load / persist (via storage backend)
// ---------------------------------------------------------------------------
let cache: AppSettings | null = null;

function normalize(s: AppSettings): AppSettings {
  const seed = seedFromEnv();
  // ensure all barbers present, keep known templates
  const barbers = DEFAULT_BARBERS.map((d) => {
    const found = s.barbers?.find((b) => b.slug === d.slug);
    return {
      slug: d.slug,
      displayName: found?.displayName || d.displayName,
      template: d.template,
      staffId: found?.staffId ?? 0,
      enabled: found ? found.enabled && found.staffId > 0 : false,
    };
  });
  return {
    yclients: { ...seed.yclients, ...s.yclients },
    telegram: { ...seed.telegram, ...s.telegram },
    bookingUrl: s.bookingUrl || seed.bookingUrl,
    schedule: { ...seed.schedule, ...s.schedule },
    barbers,
  };
}

/**
 * Synchronous accessor. Returns the loaded settings, or seeds from env on first
 * access before initSettings() has run. On serverless, call initSettings() at
 * the start of each request so this returns the persisted (KV) settings.
 */
export function getSettings(): AppSettings {
  if (!cache) cache = seedFromEnv();
  return cache;
}

/** Load persisted settings from the backend into the cache (cold start). */
export async function initSettings(): Promise<AppSettings> {
  try {
    const raw = await storage().getRaw(SETTINGS_KEY);
    if (raw) {
      cache = normalize(JSON.parse(decryptBlob(raw)) as AppSettings);
      return cache;
    }
  } catch (err) {
    logger.warn('failed to load settings, seeding from env', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  cache = seedFromEnv();
  await persist(cache);
  return cache;
}

async function persist(s: AppSettings): Promise<void> {
  await storage().setRaw(SETTINGS_KEY, encryptBlob(JSON.stringify(s)));
}

/**
 * Apply a partial update. Secret token fields are preserved when the incoming
 * value is empty/undefined (so a blank field in the UI never wipes a saved
 * token); pass an explicit value to change one.
 */
export type SettingsPatch = {
  yclients?: Partial<AppSettings['yclients']>;
  telegram?: Partial<AppSettings['telegram']>;
  bookingUrl?: string;
  schedule?: Partial<AppSettings['schedule']>;
  barbers?: BarberSetting[];
};

const SECRET_KEYS = new Set(['partnerToken', 'userToken', 'botToken']);

function mergeSection<T extends Record<string, unknown>>(current: T, patch: Partial<T> | undefined): T {
  if (!patch) return current;
  const out: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (SECRET_KEYS.has(k) && (v === '' || v === null)) continue; // keep existing secret
    out[k] = v;
  }
  return out as T;
}

export async function updateSettings(patch: SettingsPatch): Promise<AppSettings> {
  const cur = getSettings();
  const next: AppSettings = {
    yclients: mergeSection(cur.yclients, patch.yclients),
    telegram: mergeSection(cur.telegram, patch.telegram),
    bookingUrl: patch.bookingUrl ?? cur.bookingUrl,
    schedule: mergeSection(cur.schedule, patch.schedule),
    barbers: patch.barbers ? normalizeBarbers(patch.barbers) : cur.barbers,
  };
  cache = next;
  await persist(next);
  return next;
}

function normalizeBarbers(input: BarberSetting[]): BarberSetting[] {
  return DEFAULT_BARBERS.map((d) => {
    const found = input.find((b) => b.slug === d.slug);
    const staffId = Number(found?.staffId ?? 0) || 0;
    return {
      slug: d.slug,
      displayName: found?.displayName || d.displayName,
      template: d.template,
      staffId,
      enabled: Boolean(found?.enabled) && staffId > 0,
    };
  });
}

/** Reset the in-memory cache (tests / after external file change). */
export function __resetSettingsCache(): void {
  cache = null;
}

// ---------------------------------------------------------------------------
// Derived helpers (single source of truth, read live settings)
// ---------------------------------------------------------------------------
export const isTestMode = () => getSettings().telegram.mode === 'test';
export const isDryRun = () => getSettings().telegram.dryRun;
export const businessTz = () => BUSINESS_TZ;

export const yclientsConfigured = () => {
  const y = getSettings().yclients;
  return Boolean(y.partnerToken && y.userToken && y.companyId);
};
export const telegramConfigured = () => {
  const t = getSettings().telegram;
  return Boolean(t.botToken && t.testChatId);
};
export const telegramBusinessConfigured = () => {
  const t = getSettings().telegram;
  return Boolean(t.botToken && t.businessConnectionId);
};

export function missingCredentials(): string[] {
  const s = getSettings();
  const missing: string[] = [];
  if (!s.yclients.partnerToken) missing.push('YCLIENTS_PARTNER_TOKEN');
  if (!s.yclients.userToken) missing.push('YCLIENTS_USER_TOKEN');
  if (!s.yclients.companyId) missing.push('YCLIENTS_COMPANY_ID');
  if (!s.telegram.botToken) missing.push('TELEGRAM_BOT_TOKEN');
  if (!s.telegram.testChatId) missing.push('TELEGRAM_TEST_CHAT_ID');
  return missing;
}

/** Non-secret snapshot for dashboards/health. */
export function safeConfigSnapshot() {
  const s = getSettings();
  return {
    telegramMode: s.telegram.mode,
    dryRun: s.telegram.dryRun,
    tz: BUSINESS_TZ,
    bookingUrl: s.bookingUrl,
    schedule: s.schedule,
    yclients: { configured: yclientsConfigured(), apiBase: s.yclients.apiBase, companyIdSet: Boolean(s.yclients.companyId) },
    telegram: {
      botTokenSet: Boolean(s.telegram.botToken),
      testChatIdSet: Boolean(s.telegram.testChatId),
      productionChatIdSet: Boolean(s.telegram.productionChatId),
      businessConnectionIdSet: Boolean(s.telegram.businessConnectionId),
    },
    schedulerEnabled: env.server.schedulerEnabled,
  };
}

/** Masked settings for the Settings UI (safe to send to the browser). */
export function getSafeSettings() {
  const s = getSettings();
  const mask = (v: string) => (v ? '••••••' + v.slice(-3) : '');
  return {
    yclients: {
      partnerTokenSet: Boolean(s.yclients.partnerToken),
      userTokenSet: Boolean(s.yclients.userToken),
      companyId: s.yclients.companyId,
      apiBase: s.yclients.apiBase,
    },
    telegram: {
      botTokenSet: Boolean(s.telegram.botToken),
      botTokenHint: mask(s.telegram.botToken),
      testChatId: s.telegram.testChatId,
      productionChatId: s.telegram.productionChatId,
      businessConnectionIdSet: Boolean(s.telegram.businessConnectionId),
      businessConnectionId: s.telegram.businessConnectionId,
      mode: s.telegram.mode,
      dryRun: s.telegram.dryRun,
    },
    bookingUrl: s.bookingUrl,
    schedule: s.schedule,
    barbers: s.barbers,
  };
}
