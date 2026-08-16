import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

/**
 * Central, validated configuration.
 *
 * Secrets are read here (server-side) and nowhere else. Never log the parsed
 * object directly — use `safeConfigSnapshot()` for anything user-facing.
 */

const HHmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:mm (24h)');

const rawSchema = z.object({
  // YCLIENTS
  YCLIENTS_PARTNER_TOKEN: z.string().default(''),
  YCLIENTS_USER_TOKEN: z.string().default(''),
  YCLIENTS_COMPANY_ID: z.string().default(''),
  YCLIENTS_API_BASE: z.string().url().default('https://api.yclients.com/api/v1'),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_TEST_CHAT_ID: z.string().default(''),
  TELEGRAM_PRODUCTION_CHAT_ID: z.string().default(''),
  TELEGRAM_BUSINESS_CONNECTION_ID: z.string().default(''),
  TELEGRAM_MODE: z.enum(['test', 'production']).default('test'),
  TELEGRAM_DRY_RUN: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() === 'true'),

  // Booking
  BOOKING_URL: z.string().url().default('https://n2387007.yclients.com'),

  // Timezone
  TZ: z.string().default('Europe/Moscow'),

  // Schedules (Europe/Moscow)
  STORY_MORNING_TIME: HHmm.default('09:30'),
  STORY_DAY_TIME: HHmm.default('13:30'),
  STORY_EVENING_TIME: HHmm.default('17:30'),
  DAILY_REPORT_TIME: HHmm.default('21:30'),

  // Server
  PORT: z.coerce.number().int().positive().default(3000),
  ADMIN_API_TOKENS: z.string().default(''),
  SCHEDULER_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() !== 'false'),

  // Barbers
  BARBER_ARTASH_STAFF_ID: z.string().default(''),
  BARBER_KSENIA_STAFF_ID: z.string().default(''),
  BARBER_DMITRIY_STAFF_ID: z.string().default(''),
});

const parsed = rawSchema.parse(process.env);

/** Business timezone — the single source of truth for "today", schedules, etc. */
export const BUSINESS_TZ = parsed.TZ || 'Europe/Moscow';

export type TelegramMode = 'test' | 'production';

export const env = {
  yclients: {
    partnerToken: parsed.YCLIENTS_PARTNER_TOKEN,
    userToken: parsed.YCLIENTS_USER_TOKEN,
    companyId: parsed.YCLIENTS_COMPANY_ID,
    apiBase: parsed.YCLIENTS_API_BASE,
  },
  telegram: {
    botToken: parsed.TELEGRAM_BOT_TOKEN,
    testChatId: parsed.TELEGRAM_TEST_CHAT_ID,
    productionChatId: parsed.TELEGRAM_PRODUCTION_CHAT_ID,
    businessConnectionId: parsed.TELEGRAM_BUSINESS_CONNECTION_ID,
    mode: parsed.TELEGRAM_MODE as TelegramMode,
    dryRun: parsed.TELEGRAM_DRY_RUN,
  },
  bookingUrl: parsed.BOOKING_URL,
  tz: BUSINESS_TZ,
  schedule: {
    morning: parsed.STORY_MORNING_TIME,
    day: parsed.STORY_DAY_TIME,
    evening: parsed.STORY_EVENING_TIME,
    dailyReport: parsed.DAILY_REPORT_TIME,
  },
  server: {
    port: parsed.PORT,
    adminTokens: parsed.ADMIN_API_TOKENS.split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    schedulerEnabled: parsed.SCHEDULER_ENABLED,
  },
  barberStaffIds: {
    artash: parsed.BARBER_ARTASH_STAFF_ID,
    ksenia: parsed.BARBER_KSENIA_STAFF_ID,
    dmitriy: parsed.BARBER_DMITRIY_STAFF_ID,
  },
} as const;

// Runtime-mutable helpers (isTestMode, *Configured, safeConfigSnapshot,
// missingCredentials, …) live in ./settings.ts, which seeds from `env` above
// and is the source of truth once the app is running.
